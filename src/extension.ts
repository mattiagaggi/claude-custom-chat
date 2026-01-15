/**
 * Claude Custom Chat Extension
 * A clean, minimal VS Code extension providing a chat interface for Claude Code CLI
 */

import * as vscode from 'vscode';
import * as path from 'path';
import getHtml from './ui';
import { ProcessManager, ConversationManager, PermissionManager, DevModeManager } from './managers';
import {
	WebviewMessageHandler,
	StreamParser,
	MCPHandler,
	ConversationHandler,
	PermissionRequestHandler,
	createStreamCallbacks,
	DiffContentProvider,
	IdleDetectionManager,
	openDiff as utilOpenDiff,
	openFile as utilOpenFile,
	runFileInTerminal as utilRunFileInTerminal,
	selectImage as utilSelectImage,
	selectImageFile as utilSelectImageFile,
	createImageFile as utilCreateImageFile,
	openTerminal,
	getClipboardText as utilGetClipboardText,
	getSettings as utilGetSettings,
	updateSettings as utilUpdateSettings,
	enableYoloMode as utilEnableYoloMode,
	getPlatformInfo
} from './handlers';

export function activate(context: vscode.ExtensionContext) {
	const providers = [
		new ClaudeChatProvider(context.extensionUri, context, 1),
		new ClaudeChatProvider(context.extensionUri, context, 2),
		new ClaudeChatProvider(context.extensionUri, context, 3)
	];

	// Initialize Dev Mode Manager
	const devModeManager = new DevModeManager(context.extensionUri.fsPath);
	context.subscriptions.push(devModeManager);

	// Set up reload callback to save conversation state before reload
	devModeManager.setReloadCallback(async () => {
		for (const provider of providers) {
			await provider.saveConversationState();
		}
	});

	// Share DevModeManager with all providers
	providers.forEach(p => p.setDevModeManager(devModeManager));

	context.subscriptions.push(
		vscode.commands.registerCommand('claude-custom-chat.openChat', (column?: vscode.ViewColumn) => {
			providers[0].show(column || vscode.ViewColumn.Two);
		}),
		vscode.commands.registerCommand('claude-custom-chat.openChat1', () => providers[0].show(vscode.ViewColumn.One)),
		vscode.commands.registerCommand('claude-custom-chat.openChat2', () => providers[1].show(vscode.ViewColumn.Two)),
		vscode.commands.registerCommand('claude-custom-chat.openChat3', () => providers[2].show(vscode.ViewColumn.Three)),
		vscode.commands.registerCommand('claude-custom-chat.loadConversation', (f: string) => providers[0].loadConversation(f)),
		vscode.commands.registerCommand('claude-custom-chat.devModeRollback', () => devModeManager.rollbackToLatestSnapshot()),
		vscode.commands.registerCommand('claude-custom-chat.devModePickSnapshot', () => devModeManager.pickAndRollbackSnapshot()),
		vscode.commands.registerCommand('claude-custom-chat.devModeClearSnapshots', () => devModeManager.clearSnapshots()),
		vscode.window.registerWebviewViewProvider('claude-custom-chat.chat',
			new ClaudeChatWebviewProvider(context.extensionUri, context, providers[0])),
		vscode.workspace.registerTextDocumentContentProvider('claude-diff', new DiffContentProvider()),
		vscode.workspace.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('claudeCodeChat.wsl')) {
				providers.forEach(p => p.newSession());
			}
		})
	);

	const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
	statusBar.text = "Claude";
	statusBar.tooltip = "Open Claude Code Chat (Ctrl+Shift+C)";
	statusBar.command = 'claude-custom-chat.openChat';
	statusBar.show();
	context.subscriptions.push(statusBar);
}

export function deactivate() { }

class ClaudeChatWebviewProvider implements vscode.WebviewViewProvider {
	constructor(
		private readonly extensionUri: vscode.Uri,
		private readonly context: vscode.ExtensionContext,
		private readonly chatProvider: ClaudeChatProvider
	) { }

	resolveWebviewView(webviewView: vscode.WebviewView) {
		// Instead of showing content in the sidebar, open the panel
		// This makes the sidebar icon behave the same as the status bar icon
		this.chatProvider.show(vscode.ViewColumn.Two);

		// Set minimal HTML to avoid showing any content in sidebar
		webviewView.webview.options = { enableScripts: true, localResourceRoots: [this.extensionUri] };
		webviewView.webview.html = `<!DOCTYPE html><html><body></body></html>`;
	}
}

class ClaudeChatProvider {
	public panel: vscode.WebviewPanel | undefined;
	private webview: vscode.Webview | undefined;
	private webviewView: vscode.WebviewView | undefined;
	private messageHandlerDisposable: vscode.Disposable | undefined;

	private processManager: ProcessManager;
	private conversationManager: ConversationManager;
	private permissionManager: PermissionManager;
	private devModeManager?: DevModeManager;
	private messageHandler: WebviewMessageHandler;
	private streamParser: StreamParser;
	private mcpHandler: MCPHandler;
	private conversationHandler: ConversationHandler;
	private permissionRequestHandler: PermissionRequestHandler;
	private idleDetectionManager: IdleDetectionManager;

	private selectedModel = 'default';
	private chatNumber: number;
	private currentConversationId: string | undefined;
	private conversationStreamingText: Map<string, string> = new Map();
	private processingConversationIds: Set<string> = new Set();

	constructor(
		private readonly extensionUri: vscode.Uri,
		private readonly context: vscode.ExtensionContext,
		chatNumber: number = 1
	) {
		this.chatNumber = chatNumber;
		this.processManager = new ProcessManager();
		this.conversationManager = new ConversationManager(context);
		this.permissionManager = new PermissionManager(context);
		this.mcpHandler = new MCPHandler();

		this.permissionRequestHandler = new PermissionRequestHandler({
			permissionManager: this.permissionManager,
			processManager: this.processManager,
			postMessage: (msg) => this.postMessage(msg),
			onEditPermissionRequest: (f, o, n) => this.openFileWithEditHighlight(f, o, n)
		});

		this.messageHandler = new WebviewMessageHandler(context, this.createMessageCallbacks());

		this.conversationHandler = new ConversationHandler({
			conversationManager: this.conversationManager,
			processManager: this.processManager,
			postMessage: (msg) => this.postMessage(msg),
			getCurrentConversationId: () => this.currentConversationId,
			setCurrentConversationId: (id) => { this.currentConversationId = id; },
			getProcessingConversationId: () => this.currentConversationId && this.processingConversationIds.has(this.currentConversationId) ? this.currentConversationId : undefined,
			isProcessing: () => this.currentConversationId ? this.processingConversationIds.has(this.currentConversationId) : false,
			getStreamingText: (id) => this.conversationStreamingText.get(id),
			getProcessingConversationIds: () => this.processingConversationIds
		});

		this.streamParser = new StreamParser(createStreamCallbacks({
			conversationManager: this.conversationManager,
			context: this.context,
			postMessage: (msg) => this.postMessage(msg),
			getCurrentConversationId: () => this.currentConversationId,
			getProcessingConversationId: () => this.currentConversationId && this.processingConversationIds.has(this.currentConversationId) ? this.currentConversationId : undefined,
			isProcessing: () => this.processingConversationIds.size > 0,
			setProcessingState: (isProcessing, convId) => {
				if (isProcessing && convId) {
					this.processingConversationIds.add(convId);
				} else if (!isProcessing && convId) {
					this.processingConversationIds.delete(convId);
				}
			},
			getStreamingText: (id) => this.conversationStreamingText.get(id),
			setStreamingText: (id, text) => this.conversationStreamingText.set(id, text),
			deleteStreamingText: (id) => this.conversationStreamingText.delete(id),
			onControlRequest: (req, convId) => this.permissionRequestHandler.handleControlRequest(req, convId),
			onToolActivity: () => this.idleDetectionManager.resetTimer()
		}));

		this.idleDetectionManager = new IdleDetectionManager({
			postMessage: (msg) => this.postMessage(msg),
			isProcessing: () => this.processingConversationIds.size > 0
		});

		this.selectedModel = context.workspaceState.get('claude.selectedModel', 'default');
		this.currentConversationId = this.conversationManager.getActiveConversationId();

		if (chatNumber === 1) {
			const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
			if (workspacePath) {
				this.idleDetectionManager.initializeAnalyzer(workspacePath);
			}
		}
	}

	show(column: vscode.ViewColumn | vscode.Uri = vscode.ViewColumn.Two) {
		const actualColumn = column instanceof vscode.Uri ? vscode.ViewColumn.Two : column;
		if (this.webviewView) {
			this.webviewView = undefined;
		}
		if (this.panel) {
			this.panel.reveal(actualColumn);
			return;
		}

		this.panel = vscode.window.createWebviewPanel('claudeChat',
			`Claude Custom Chat ${this.chatNumber > 1 ? this.chatNumber : ''}`.trim(),
			actualColumn,
			{ enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [this.extensionUri] }
		);
		this.panel.iconPath = vscode.Uri.joinPath(this.extensionUri, 'icon-bubble.png');
		this.panel.webview.html = this.getHtml(this.panel.webview);
		this.setupWebview(this.panel.webview);
		this.panel.onDidDispose(() => { this.panel = undefined; this.messageHandlerDisposable?.dispose(); });
		this.sendReady();
	}

	showInWebview(webview: vscode.Webview, view?: vscode.WebviewView) {
		if (this.panel) { this.panel.dispose(); this.panel = undefined; }
		this.webview = webview;
		this.webviewView = view;
		webview.html = this.getHtml(webview);
		this.setupWebview(webview);
		this.sendReady();
	}

	reinitialize() {
		this.sendReady();
		if (this.currentConversationId && this.processingConversationIds.has(this.currentConversationId)) {
			const streamingText = this.conversationStreamingText.get(this.currentConversationId);
			if (streamingText) {
				this.postMessage({ type: 'streamingReplay', data: streamingText, conversationId: this.currentConversationId });
			}
			this.postMessage({ type: 'setProcessing', data: { isProcessing: true, requestStartTime: Date.now() }, conversationId: this.currentConversationId });
		}
		this.permissionRequestHandler.resendPendingPermissions();
	}

	async newSession() {
		await this.conversationManager.saveConversation();
		await this.conversationManager.pruneOldConversations(100);
		this.conversationManager.startConversation();
		this.currentConversationId = this.conversationManager.getActiveConversationId();
		this.postMessage({ type: 'sessionCleared', conversationId: this.currentConversationId });
		this.postMessage({ type: 'setProcessing', data: { isProcessing: false }, conversationId: this.currentConversationId });
		this.sendConversationList();
		this.conversationHandler.sendActiveConversations();
	}

	async loadConversation(filename: string) {
		const convId = this.conversationManager.getConversationIdForFilename(filename);
		const isProcessing = convId ? this.processingConversationIds.has(convId) : false;
		await this.conversationHandler.loadConversation(filename, { isProcessing, processingConversationId: isProcessing ? convId : undefined });
		this.permissionRequestHandler.resendPendingPermissions();
	}

	private setupWebview(webview: vscode.Webview) {
		this.messageHandlerDisposable?.dispose();
		this.messageHandlerDisposable = webview.onDidReceiveMessage(msg => this.handleWebviewMessage(msg));
	}

	private async handleWebviewMessage(message: any) {
		switch (message.type) {
			case 'ready': return this.reinitialize();
			case 'getConversationList': return this.sendConversationList();
			case 'getWorkspaceFiles': return this.postMessage({ type: 'workspaceFiles', data: [] });
			case 'getRecentFiles': return this.postMessage({ type: 'recentFiles', data: await this.getRecentWorkspaceFiles(message.searchTerm) });
			case 'getSettings': return this.postMessage({ type: 'settings', data: utilGetSettings() });
			case 'updateSettings': return utilUpdateSettings(message.settings);
			case 'getClipboardText': return this.postMessage({ type: 'clipboardText', data: await utilGetClipboardText() });
			case 'getPermissions': return this.postMessage({ type: 'permissions', data: this.permissionManager.getAllPermissions() });
			case 'getCustomSnippets': return this.postMessage({ type: 'customSnippets', data: {} });
			case 'enableYoloMode': return utilEnableYoloMode();
			case 'openDiffByIndex': return;
			case 'createImageFile': return this.postMessage({ type: 'imagePath', path: utilCreateImageFile(message.imageData, message.imageType) });
			case 'selectImageFile': { const p = await utilSelectImageFile(); if (p) this.postMessage({ type: 'imagePath', path: p }); return; }
			case 'copyToClipboard': return vscode.env.clipboard.writeText(message.text);
			case 'requestNextSuggestion': return this.idleDetectionManager.showNextSuggestion();
			case 'toggleDevMode': {
				if (!this.devModeManager) {
					vscode.window.showErrorMessage('Dev Mode Manager not initialized');
					return;
				}
				if (message.enable) {
					await this.devModeManager.enableDevMode();
				} else {
					const choice = await vscode.window.showInformationMessage(
						'Disable Dev Mode?',
						'Keep Changes',
						'Rollback Changes'
					);
					if (choice === 'Rollback Changes') {
						await this.devModeManager.disableDevMode(true);
					} else if (choice === 'Keep Changes') {
						await this.devModeManager.disableDevMode(false);
					}
				}
				return;
			}
		}
		await this.messageHandler.handleMessage(message);
	}

	private createMessageCallbacks() {
		return {
			onSendMessage: (text: string, planMode?: boolean, thinkingMode?: boolean, skip?: boolean) => this.sendMessageToClaude(text, planMode, thinkingMode, skip),
			onNewSession: () => this.newSession(),
			onStopRequest: () => this.stopCurrentProcess(),
			onLoadConversation: (f: string) => this.loadConversation(f),
			onSetModel: (m: string) => { this.selectedModel = m; this.context.workspaceState.update('claude.selectedModel', m); },
			onOpenModelTerminal: () => openTerminal('Claude Model', 'claude --help'),
			onOpenUsageTerminal: (t: string) => openTerminal('Claude Usage', `claude usage ${t}`),
			onRunInstallCommand: () => openTerminal('Install Claude', 'npm install -g @anthropic/claude'),
			onExecuteSlashCommand: (c: string) => this.executeSlashCommand(c),
			onOpenDiff: utilOpenDiff,
			onOpenFile: utilOpenFile,
			onRunFileInTerminal: utilRunFileInTerminal,
			onSelectImage: async () => { const p = await utilSelectImage(); if (p) this.postMessage({ type: 'imageSelected', data: p }); },
			onPermissionResponse: (id: string, ok: boolean, always?: boolean) => this.permissionRequestHandler.handlePermissionResponse(id, ok, always),
			onUserQuestionResponse: (id: string, ans: Record<string, string>) => this.permissionRequestHandler.handleUserQuestionResponse(id, ans),
			onSaveInputText: () => { },
			onDismissWSLAlert: () => this.context.globalState.update('wslAlertDismissed', true),
			onSendPermissions: async () => this.postMessage({ type: 'permissions', data: this.permissionManager.getAllPermissions() }),
			onRemovePermission: (t: string, c: string | null) => this.permissionManager.removePermission(t, c || ''),
			onAddPermission: async (t: string, c: string | null) => {
				const input: Record<string, unknown> = {};
				if (t === 'Bash' && c) {
					input.command = c;
				} else if (['Read', 'Write', 'Edit'].includes(t) && c) {
					input.file_path = c;
				}
				await this.permissionManager.addAlwaysAllowPermission(t, input);
				this.postMessage({ type: 'permissions', data: this.permissionManager.getAllPermissions() });
			},
			onLoadMCPServers: async () => this.postMessage({ type: 'mcpServersLoaded', servers: await this.mcpHandler.loadServers() }),
			onSaveMCPServer: async (n: string, cfg: any) => { if (await this.mcpHandler.saveServer(n, cfg)) this.postMessage({ type: 'mcpServersLoaded', servers: await this.mcpHandler.loadServers() }); },
			onDeleteMCPServer: async (n: string) => { if (await this.mcpHandler.deleteServer(n)) this.postMessage({ type: 'mcpServersLoaded', servers: await this.mcpHandler.loadServers() }); },
			onSendCustomSnippets: async () => this.postMessage({ type: 'customSnippets', data: {} }),
			onSaveCustomSnippet: async () => { },
			onDeleteCustomSnippet: async () => { },
			onGetActiveConversations: () => this.conversationHandler.sendActiveConversations(),
			onSwitchConversation: async (id: string) => { await this.conversationHandler.switchConversation(id); this.permissionRequestHandler.resendPendingPermissions(); },
			onCloseConversation: (id: string) => this.conversationHandler.closeConversation(id, () => this.newSession()),
			onStopConversation: (id: string) => this.stopConversationProcess(id),
			onOpenConversationInNewPanel: async (f: string) => {
				await vscode.commands.executeCommand('claude-custom-chat.openChat2');
				await new Promise(r => setTimeout(r, 100));
				await vscode.commands.executeCommand('claude-custom-chat.loadConversation', f);
			},
			onGetBranches: async () => {
				if (this.devModeManager) {
					const branches = await this.devModeManager.getAllBranches();
					this.postMessage({ type: 'branches', data: branches });
				}
			},
			onPushToBranch: async (branchName: string, commitMessage: string) => {
				if (this.devModeManager && this.devModeManager.isActive()) {
					await this.devModeManager.pushToBranch(branchName, commitMessage, false);
				} else if (this.devModeManager) {
					// Allow push even without Dev Mode active
					await this.devModeManager.pushToBranch(branchName, commitMessage, false);
				} else {
					vscode.window.showWarningMessage('Git functionality not available');
				}
			},
			onPushToNewBranch: async (branchName: string, commitMessage: string) => {
				if (this.devModeManager && this.devModeManager.isActive()) {
					await this.devModeManager.pushToNewBranch(branchName, commitMessage);
				} else if (this.devModeManager) {
					// Allow push even without Dev Mode active
					await this.devModeManager.pushToNewBranch(branchName, commitMessage);
				} else {
					vscode.window.showWarningMessage('Git functionality not available');
				}
			}
		};
	}

	private async sendMessageToClaude(message: string, _planMode?: boolean, thinkingMode?: boolean, skipUIDisplay?: boolean) {
		// Detect slash commands typed in chat (e.g., "/help", "/doctor")
		const slashMatch = message.match(/^\/(\S+)(?:\s|$)/);
		if (slashMatch) {
			const command = slashMatch[1];
			// Show the command in chat
			if (!skipUIDisplay) {
				this.postMessage({ type: 'userInput', data: message });
				this.conversationManager.addMessage('userInput', message, this.currentConversationId);
			}
			await this.executeSlashCommand(command);
			return;
		}

		if (this.currentConversationId && this.processingConversationIds.has(this.currentConversationId)) {
			await this.stopConversationProcess(this.currentConversationId);
			this.postMessage({ type: 'assistantMessage', data: '⚠️ _Previous operation cancelled - starting new request..._' });
			this.conversationManager.addMessage('assistantMessage', '⚠️ _Previous operation cancelled - starting new request..._', this.currentConversationId);
		}

		const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
		const cwd = workspaceFolder ? workspaceFolder.uri.fsPath : process.cwd();
		const config = vscode.workspace.getConfiguration('claudeCodeChat');

		const args = ['--print', '--output-format', 'stream-json', '--input-format', 'stream-json', '--verbose', '--include-partial-messages'];
		if (config.get<boolean>('permissions.yoloMode', false)) {
			args.push('--dangerously-skip-permissions');
		} else {
			args.push('--permission-prompt-tool', 'stdio');
		}
		const mcpPath = this.mcpHandler.getConfigPath();
		if (mcpPath) {
			args.push('--mcp-config', mcpPath);
		}
		if (thinkingMode) {
			message = `${config.get<string>('thinking.intensity', 'think').toUpperCase().replace('-', ' ')} THROUGH THIS STEP BY STEP: \n${message}`;
		}

		// Dev Mode: Extension source is available via custom tool
		// Claude can call the tool when it needs to see the extension code

		if (this.selectedModel && this.selectedModel !== 'default') {
			args.push('--model', this.selectedModel);
		}

		const conversation = this.currentConversationId ? this.conversationManager.getConversation(this.currentConversationId) : null;
		const sessionId = conversation?.sessionId;
		if (sessionId) {
			args.push('--resume', sessionId);
		}

		const spawnedConversationId = this.currentConversationId;
		if (!spawnedConversationId) { this.postMessage({ type: 'error', data: 'No active conversation' }); return; }

		this.processingConversationIds.add(spawnedConversationId);
		if (!skipUIDisplay) { this.postMessage({ type: 'userInput', data: message }); this.conversationManager.addMessage('userInput', message, spawnedConversationId); }
		else this.conversationManager.addMessage('userInput', message, spawnedConversationId);

		await this.conversationManager.saveConversation(spawnedConversationId);
		this.sendConversationList();
		this.postMessage({ type: 'setProcessing', data: { isProcessing: true }, conversationId: spawnedConversationId });
		this.postMessage({ type: 'loading', data: 'Claude is working...', conversationId: spawnedConversationId });
		this.conversationHandler.sendActiveConversations();
		this.idleDetectionManager.start();

		try {
			const proc = await this.processManager.spawnForConversation({
				args, cwd,
				wslEnabled: config.get('wsl.enabled', false),
				wslDistro: config.get('wsl.distro', 'Ubuntu'),
				nodePath: config.get('wsl.nodePath', '/usr/bin/node'),
				claudePath: config.get('wsl.claudePath', '/usr/local/bin/claude')
			}, spawnedConversationId);

			this.processManager.writeToConversation(spawnedConversationId, JSON.stringify({
				type: 'user', session_id: sessionId || '',
				message: { role: 'user', content: [{ type: 'text', text: message }] },
				parent_tool_use_id: null
			}) + '\n');

			proc.stdout?.on('data', (d) => this.streamParser.parseChunk(d.toString(), spawnedConversationId));
			proc.stderr?.on('data', (d) => { const e = d.toString(); if (e.trim()) this.postMessage({ type: 'error', data: `[CLI Error] ${e}`, conversationId: spawnedConversationId }); });
			proc.on('close', () => this.handleProcessEnd(spawnedConversationId));
			proc.on('error', (e) => this.handleProcessError(spawnedConversationId, e));
		} catch (e: any) {
			this.processingConversationIds.delete(spawnedConversationId);
			this.postMessage({ type: 'clearLoading', conversationId: spawnedConversationId });
			this.postMessage({ type: 'setProcessing', data: { isProcessing: false }, conversationId: spawnedConversationId });
			this.postMessage({ type: 'error', data: `Failed to start: ${e.message}`, conversationId: spawnedConversationId });
			this.conversationHandler.sendActiveConversations();
		}
	}

	private handleProcessEnd(convId: string) {
		this.processingConversationIds.delete(convId);
		if (this.processingConversationIds.size === 0) {
			this.idleDetectionManager.stop();
		}
		this.postMessage({ type: 'clearLoading', conversationId: convId });
		this.postMessage({ type: 'setProcessing', data: { isProcessing: false }, conversationId: convId });
		this.conversationHandler.sendActiveConversations();
	}

	private handleProcessError(convId: string, error: Error) {
		this.processingConversationIds.delete(convId);
		if (this.processingConversationIds.size === 0) {
			this.idleDetectionManager.stop();
		}
		this.postMessage({ type: 'clearLoading', conversationId: convId });
		this.postMessage({ type: 'setProcessing', data: { isProcessing: false }, conversationId: convId });
		this.conversationHandler.sendActiveConversations();
		if (error.message.includes('ENOENT')) {
			this.postMessage({ type: 'showInstallModal' });
		} else {
			this.postMessage({ type: 'error', data: `Error: ${error.message}`, conversationId: convId });
		}
	}

	private async stopCurrentProcess() {
		if (this.currentConversationId && this.processingConversationIds.has(this.currentConversationId)) {
			await this.stopConversationProcess(this.currentConversationId);
		}
	}

	private async stopConversationProcess(convId: string) {
		await this.processManager.terminateConversation(convId);
		const text = this.conversationStreamingText.get(convId);
		if (text) {
			this.conversationManager.addMessage('assistantMessage', text, convId);
			this.postMessage({ type: 'finalizeStreaming', data: text, conversationId: convId });
		}
		this.conversationStreamingText.delete(convId);
		this.processingConversationIds.delete(convId);
		this.postMessage({ type: 'clearLoading', conversationId: convId });
		this.postMessage({ type: 'setProcessing', data: { isProcessing: false }, conversationId: convId });
		this.conversationHandler.sendActiveConversations();
	}

	/**
	 * Execute slash commands - routes to appropriate handler based on command type
	 */
	private async executeSlashCommand(command: string) {
		// Commands that run claude CLI and show output in chat
		const cliCommands: Record<string, string[]> = {
			'help': ['--help'],
			'doctor': ['doctor'],
			'config': ['config'],
			'mcp': ['mcp'],
			'status': ['status'],
			'model': ['model'],
			'permissions': ['permissions'],
			'agents': ['agents']
		};

		// Commands handled directly by the extension
		if (command === 'clear') {
			await this.newSession();
			return;
		}

		if (command === 'cost' || command === 'usage') {
			this.sendCurrentUsage();
			this.postMessage({ type: 'assistantMessage', data: '_Use the usage panel in the header to see detailed costs._' });
			return;
		}

		// Commands that need terminal interaction (can't capture output easily)
		const terminalCommands = ['login', 'logout', 'init', 'terminal-setup', 'vim'];
		if (terminalCommands.includes(command)) {
			openTerminal(`Claude ${command}`, `claude ${command}`);
			this.postMessage({ type: 'assistantMessage', data: `_Opening terminal for \`claude ${command}\`..._` });
			return;
		}

		// Commands that run and show output in chat
		if (cliCommands[command]) {
			await this.runClaudeCommandInChat(cliCommands[command]);
			return;
		}

		// Commands that need to be sent to Claude as regular messages (they're prompts, not CLI commands)
		const promptCommands = ['bug', 'review', 'pr_comments', 'add-dir', 'memory', 'compact', 'rewind'];
		if (promptCommands.includes(command)) {
			// These are actually prompts/tasks for Claude, send them as messages
			// Use a flag to prevent infinite loop since the message starts with /
			this.postMessage({ type: 'userInput', data: `/${command}` });
			this.conversationManager.addMessage('userInput', `/${command}`, this.currentConversationId);
			// Send without the slash to Claude
			await this.sendRegularMessage(`Please help me with the /${command} task`);
			return;
		}

		// Fallback: unknown command - show available commands
		const availableCommands = [
			...Object.keys(cliCommands),
			'clear', 'cost', 'usage',
			...terminalCommands,
			...promptCommands
		].sort().join(', ');
		this.postMessage({
			type: 'assistantMessage',
			data: `Unknown command \`/${command}\`. Available commands: ${availableCommands}`
		});
	}

	/**
	 * Run a claude CLI command and display output in chat
	 */
	private async runClaudeCommandInChat(args: string[]) {
		const cp = require('child_process');

		// Find claude command
		let claudeCommand = 'claude';
		if (process.platform === 'darwin') {
			const fs = require('fs');
			if (fs.existsSync('/opt/homebrew/bin/claude')) {
				claudeCommand = '/opt/homebrew/bin/claude';
			} else if (fs.existsSync('/usr/local/bin/claude')) {
				claudeCommand = '/usr/local/bin/claude';
			}
		}

		this.postMessage({ type: 'loading', data: `Running \`claude ${args.join(' ')}\`...` });

		try {
			const result = await new Promise<string>((resolve, reject) => {
				cp.execFile(claudeCommand, args, {
					timeout: 30000,
					maxBuffer: 1024 * 1024,
					env: {
						...process.env,
						PATH: `${process.env.PATH || ''}:/opt/homebrew/bin:/usr/local/bin`,
						FORCE_COLOR: '0',
						NO_COLOR: '1'
					}
				}, (error: any, stdout: string, stderr: string) => {
					if (error && !stdout) {
						reject(new Error(stderr || error.message));
					} else {
						resolve(stdout || stderr);
					}
				});
			});

			this.postMessage({ type: 'clearLoading' });
			// Format output as code block
			const formattedOutput = '```\n' + result.trim() + '\n```';
			this.postMessage({ type: 'assistantMessage', data: formattedOutput });
			this.conversationManager.addMessage('assistantMessage', formattedOutput, this.currentConversationId);
		} catch (error: any) {
			this.postMessage({ type: 'clearLoading' });
			this.postMessage({ type: 'error', data: `Command failed: ${error.message}` });
		}
	}

	/**
	 * Send a regular message to Claude (bypasses slash command detection)
	 */
	private async sendRegularMessage(message: string) {
		// This is the actual message sending logic, extracted to avoid slash command loop
		if (this.currentConversationId && this.processingConversationIds.has(this.currentConversationId)) {
			await this.stopConversationProcess(this.currentConversationId);
			this.postMessage({ type: 'assistantMessage', data: '⚠️ _Previous operation cancelled - starting new request..._' });
			this.conversationManager.addMessage('assistantMessage', '⚠️ _Previous operation cancelled - starting new request..._', this.currentConversationId);
		}

		const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
		const cwd = workspaceFolder ? workspaceFolder.uri.fsPath : process.cwd();
		const config = vscode.workspace.getConfiguration('claudeCodeChat');

		const args = ['--print', '--output-format', 'stream-json', '--input-format', 'stream-json', '--verbose', '--include-partial-messages'];
		if (config.get<boolean>('permissions.yoloMode', false)) {
			args.push('--dangerously-skip-permissions');
		} else {
			args.push('--permission-prompt-tool', 'stdio');
		}
		const mcpPath = this.mcpHandler.getConfigPath();
		if (mcpPath) {
			args.push('--mcp-config', mcpPath);
		}
		if (this.selectedModel && this.selectedModel !== 'default') {
			args.push('--model', this.selectedModel);
		}

		const conversation = this.currentConversationId ? this.conversationManager.getConversation(this.currentConversationId) : null;
		const sessionId = conversation?.sessionId;
		if (sessionId) {
			args.push('--resume', sessionId);
		}

		const spawnedConversationId = this.currentConversationId;
		if (!spawnedConversationId) { this.postMessage({ type: 'error', data: 'No active conversation' }); return; }

		this.processingConversationIds.add(spawnedConversationId);
		await this.conversationManager.saveConversation(spawnedConversationId);
		this.sendConversationList();
		this.postMessage({ type: 'setProcessing', data: { isProcessing: true }, conversationId: spawnedConversationId });
		this.postMessage({ type: 'loading', data: 'Claude is working...', conversationId: spawnedConversationId });
		this.conversationHandler.sendActiveConversations();
		this.idleDetectionManager.start();

		try {
			const proc = await this.processManager.spawnForConversation({
				args, cwd,
				wslEnabled: config.get('wsl.enabled', false),
				wslDistro: config.get('wsl.distro', 'Ubuntu'),
				nodePath: config.get('wsl.nodePath', '/usr/bin/node'),
				claudePath: config.get('wsl.claudePath', '/usr/local/bin/claude')
			}, spawnedConversationId);

			this.processManager.writeToConversation(spawnedConversationId, JSON.stringify({
				type: 'user', session_id: sessionId || '',
				message: { role: 'user', content: [{ type: 'text', text: message }] },
				parent_tool_use_id: null
			}) + '\n');

			proc.stdout?.on('data', (d: Buffer) => this.streamParser.parseChunk(d.toString(), spawnedConversationId));
			proc.stderr?.on('data', (d: Buffer) => { const e = d.toString(); if (e.trim()) this.postMessage({ type: 'error', data: `[CLI Error] ${e}`, conversationId: spawnedConversationId }); });
			proc.on('close', () => this.handleProcessEnd(spawnedConversationId));
			proc.on('error', (e: Error) => this.handleProcessError(spawnedConversationId, e));
		} catch (e: any) {
			this.processingConversationIds.delete(spawnedConversationId);
			this.postMessage({ type: 'clearLoading', conversationId: spawnedConversationId });
			this.postMessage({ type: 'setProcessing', data: { isProcessing: false }, conversationId: spawnedConversationId });
			this.postMessage({ type: 'error', data: `Failed to start: ${e.message}`, conversationId: spawnedConversationId });
			this.conversationHandler.sendActiveConversations();
		}
	}

	private postMessage(message: any) { (this.panel?.webview || this.webview)?.postMessage(message); }

	private sendReady() {
		// Ensure a conversation exists - create one if needed
		if (!this.currentConversationId) {
			this.conversationManager.startConversation();
			this.currentConversationId = this.conversationManager.getActiveConversationId();
		}

		const isProcessing = this.currentConversationId && this.processingConversationIds.has(this.currentConversationId);
		this.postMessage({ type: 'ready', data: isProcessing ? 'Claude is working...' : 'Ready to chat with Claude Code! Type your message below.' });
		this.sendConversationList();
		this.postMessage({ type: 'settings', data: utilGetSettings() });
		this.postMessage({ type: 'platformInfo', data: getPlatformInfo() });
		if (this.currentConversationId) {
			this.postMessage({ type: 'conversationSwitched', conversationId: this.currentConversationId });
		}
		this.sendCurrentUsage();
	}

	private sendConversationList() {
		const convs = this.conversationManager.getConversationList().map(c => {
			const id = this.conversationManager.getConversationIdForFilename(c.filename);
			return { ...c, isProcessing: id === this.currentConversationId || (id ? this.processingConversationIds.has(id) : false) };
		});
		this.postMessage({ type: 'conversationList', data: convs });
	}

	private sendCurrentUsage() {
		const conv = this.currentConversationId ? this.conversationManager.getConversation(this.currentConversationId) : null;
		if (conv) {
			const reqCount = conv.messages?.filter((m: any) => m.messageType === 'userInput').length || 0;
			this.postMessage({
				type: 'usage',
				data: { inputTokens: conv.totalTokensInput || 0, outputTokens: conv.totalTokensOutput || 0, totalCost: conv.totalCost || 0, requestCount: reqCount, isInitialLoad: true },
				conversationId: this.currentConversationId
			});
		}
	}

	private async getRecentWorkspaceFiles(searchTerm?: string): Promise<Array<{ name: string; path: string; relativePath: string; mtime: number }>> {
		const workspaceFolders = vscode.workspace.workspaceFolders;
		if (!workspaceFolders || workspaceFolders.length === 0) {
			return [];
		}

		const workspaceRoot = workspaceFolders[0].uri.fsPath;

		try {
			// Find files in workspace, excluding common non-code directories
			const pattern = '**/*';
			const exclude = '{**/node_modules/**,**/.git/**,**/dist/**,**/build/**,**/.next/**,**/coverage/**,**/__pycache__/**,**/.venv/**,**/venv/**,**/*.min.js,**/*.min.css}';

			const files = await vscode.workspace.findFiles(pattern, exclude, 100);

			// Get file stats for sorting by mtime
			const fileInfos = await Promise.all(
				files.map(async (file) => {
					try {
						const stat = await vscode.workspace.fs.stat(file);
						const relativePath = path.relative(workspaceRoot, file.fsPath);
						const name = path.basename(file.fsPath);
						return {
							name,
							path: file.fsPath,
							relativePath,
							mtime: stat.mtime
						};
					} catch {
						return null;
					}
				})
			);

			// Filter out nulls and apply search filter if provided
			let filtered = fileInfos.filter((f): f is NonNullable<typeof f> => f !== null);

			if (searchTerm) {
				const term = searchTerm.toLowerCase();
				filtered = filtered.filter(f =>
					f.name.toLowerCase().includes(term) ||
					f.relativePath.toLowerCase().includes(term)
				);
			}

			// Sort by most recently modified
			filtered.sort((a, b) => b.mtime - a.mtime);

			// Return top 50 results
			return filtered.slice(0, 50);
		} catch (error) {
			console.error('Error getting recent files:', error);
			return [];
		}
	}

	private getHtml(webview: vscode.Webview): string {
		const cssUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'out', 'webview', 'styles.css')).toString();
		const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'out', 'webview', 'script.js')).toString();
		return getHtml(vscode.env?.isTelemetryEnabled, cssUri, scriptUri);
	}

	private async openFileWithEditHighlight(filePath: string, oldString: string, _newString: string) {
		try {
			const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
			const editor = await vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.One, preserveFocus: false, preview: false });
			const idx = doc.getText().indexOf(oldString);
			if (idx !== -1) {
				const start = doc.positionAt(idx), end = doc.positionAt(idx + oldString.length);
				editor.selection = new vscode.Selection(start, end);
				editor.revealRange(new vscode.Range(start, end), vscode.TextEditorRevealType.InCenter);
				const deco = vscode.window.createTextEditorDecorationType({
					backgroundColor: new vscode.ThemeColor('diffEditor.removedTextBackground'),
					isWholeLine: true,
					overviewRulerColor: new vscode.ThemeColor('editorOverviewRuler.deletedForeground'),
					overviewRulerLane: vscode.OverviewRulerLane.Full
				});
				editor.setDecorations(deco, [new vscode.Range(new vscode.Position(start.line, 0), new vscode.Position(end.line, doc.lineAt(end.line).text.length))]);
				const disp = vscode.window.onDidChangeTextEditorSelection(() => { deco.dispose(); disp.dispose(); });
				setTimeout(() => { deco.dispose(); disp.dispose(); }, 30000);
			}
		} catch (e) { console.error('[openFileWithEditHighlight]', e); }
	}

	/**
	 * Set Dev Mode Manager for self-modification
	 */
	setDevModeManager(devModeManager: DevModeManager): void {
		this.devModeManager = devModeManager;
	}

	/**
	 * Save conversation state (called before Dev Mode reload)
	 */
	async saveConversationState(): Promise<void> {
		await this.conversationManager.saveConversation();
	}

	async dispose() {
		await this.conversationManager.saveConversation();
		this.processManager.terminate();
		this.idleDetectionManager.dispose();
		this.panel?.dispose();
	}
}
