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
	getPlatformInfo,
	startGraphBackend,
	stopGraphBackend,
	SlashCommandHandler,
	ClaudeMessageSender
} from './handlers';

export function activate(context: vscode.ExtensionContext) {
	startGraphBackend();
	const providers = [
		new ClaudeChatProvider(context.extensionUri, context, 1),
		new ClaudeChatProvider(context.extensionUri, context, 2),
		new ClaudeChatProvider(context.extensionUri, context, 3)
	];

	const devModeManager = new DevModeManager(context.extensionUri.fsPath);
	context.subscriptions.push(devModeManager);

	devModeManager.setReloadCallback(async () => {
		for (const provider of providers) {
			await provider.saveConversationState();
		}
	});

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

export function deactivate() {
	stopGraphBackend();
}

class ClaudeChatWebviewProvider implements vscode.WebviewViewProvider {
	constructor(
		private readonly extensionUri: vscode.Uri,
		private readonly context: vscode.ExtensionContext,
		private readonly chatProvider: ClaudeChatProvider
	) { }

	resolveWebviewView(webviewView: vscode.WebviewView) {
		this.chatProvider.show(vscode.ViewColumn.Two);
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
	private slashCommandHandler: SlashCommandHandler;
	private messageSender: ClaudeMessageSender;

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

		this.messageSender = new ClaudeMessageSender({
			processManager: this.processManager,
			conversationManager: this.conversationManager,
			mcpHandler: this.mcpHandler,
			streamParser: this.streamParser,
			conversationHandler: this.conversationHandler,
			idleDetectionManager: this.idleDetectionManager,
			context: this.context,
			postMessage: (msg) => this.postMessage(msg),
			getCurrentConversationId: () => this.currentConversationId,
			getProcessingConversationIds: () => this.processingConversationIds,
			getConversationStreamingText: () => this.conversationStreamingText,
			getSelectedModel: () => this.selectedModel,
			stopConversationProcess: (id) => this.stopConversationProcess(id),
			sendConversationList: () => this.sendConversationList(),
		});

		this.slashCommandHandler = new SlashCommandHandler({
			postMessage: (msg) => this.postMessage(msg),
			newSession: () => this.newSession(),
			sendCurrentUsage: () => this.sendCurrentUsage(),
			addMessage: (type, data, convId) => this.conversationManager.addMessage(type, data, convId),
			getCurrentConversationId: () => this.currentConversationId,
			sendRegularMessage: (msg) => this.messageSender.sendMessage(msg),
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
		console.log('[Extension] Received message:', message.type, message);
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
			case 'getWorkspacePath': {
				const workspaceFolders = vscode.workspace.workspaceFolders;
				const workspacePath = workspaceFolders && workspaceFolders.length > 0
					? workspaceFolders[0].uri.fsPath
					: null;
				return this.postMessage({ type: 'workspacePath', path: workspacePath });
			}
			case 'saveGraphData': {
				return this.context.workspaceState.update('claude.graphData', {
					graph: message.graph,
					expandedNodes: message.expandedNodes,
					layout: message.layout,
					view: message.view,
					timestamp: Date.now(),
				});
			}
			case 'loadGraphData': {
				const saved = this.context.workspaceState.get<any>('claude.graphData');
				return this.postMessage({ type: 'savedGraphData', data: saved || null });
			}
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
			onExecuteSlashCommand: (c: string) => this.slashCommandHandler.execute(c),
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
				if (this.devModeManager) {
					await this.devModeManager.pushToBranch(branchName, commitMessage, false);
				} else {
					vscode.window.showWarningMessage('Git functionality not available');
				}
			},
			onPushToNewBranch: async (branchName: string, commitMessage: string) => {
				if (this.devModeManager) {
					await this.devModeManager.pushToNewBranch(branchName, commitMessage);
				} else {
					vscode.window.showWarningMessage('Git functionality not available');
				}
			}
		};
	}

	private async sendMessageToClaude(message: string, _planMode?: boolean, thinkingMode?: boolean, skipUIDisplay?: boolean) {
		console.log('[Extension] sendMessageToClaude called:', { message: message.substring(0, 50), _planMode, thinkingMode, skipUIDisplay });

		// Detect slash commands typed in chat
		const slashMatch = message.match(/^\/(\S+)(?:\s|$)/);
		if (slashMatch) {
			const command = slashMatch[1];
			if (!skipUIDisplay) {
				this.postMessage({ type: 'userInput', data: message });
				this.conversationManager.addMessage('userInput', message, this.currentConversationId);
			}
			await this.slashCommandHandler.execute(command);
			return;
		}

		console.log('[Extension] Calling messageSender.sendMessage...');
		await this.messageSender.sendMessage(message, { planMode: _planMode, thinkingMode, skipUIDisplay });
		console.log('[Extension] messageSender.sendMessage completed');
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

	private postMessage(message: any) { (this.panel?.webview || this.webview)?.postMessage(message); }

	private sendReady() {
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
			const pattern = '**/*';
			const exclude = '{**/node_modules/**,**/.git/**,**/dist/**,**/build/**,**/.next/**,**/coverage/**,**/__pycache__/**,**/.venv/**,**/venv/**,**/*.min.js,**/*.min.css}';

			const files = await vscode.workspace.findFiles(pattern, exclude, 100);

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

			let filtered = fileInfos.filter((f): f is NonNullable<typeof f> => f !== null);

			if (searchTerm) {
				const term = searchTerm.toLowerCase();
				filtered = filtered.filter(f =>
					f.name.toLowerCase().includes(term) ||
					f.relativePath.toLowerCase().includes(term)
				);
			}

			filtered.sort((a, b) => b.mtime - a.mtime);

			return filtered.slice(0, 50);
		} catch (error) {
			console.error('Error getting recent files:', error);
			return [];
		}
	}

	private getHtml(webview: vscode.Webview): string {
		const cssUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'out', 'webview', 'styles.css')).toString();
		const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'out', 'webview', 'script.js')).toString();
		const cytoscapeUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'node_modules', 'cytoscape', 'dist', 'cytoscape.min.js')).toString();
		const layoutBaseUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'node_modules', 'layout-base', 'layout-base.js')).toString();
		const coseBaseUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'node_modules', 'cose-base', 'cose-base.js')).toString();
		const coseBilkentUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'node_modules', 'cytoscape-cose-bilkent', 'cytoscape-cose-bilkent.js')).toString();
		const dagreUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'node_modules', 'dagre', 'dist', 'dagre.min.js')).toString();
		const cytoscapeDagreUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'node_modules', 'cytoscape-dagre', 'cytoscape-dagre.js')).toString();
		const cspSource = webview.cspSource;
		return getHtml(vscode.env?.isTelemetryEnabled, cssUri, scriptUri, cytoscapeUri, layoutBaseUri, coseBaseUri, coseBilkentUri, dagreUri, cytoscapeDagreUri, cspSource);
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

	setDevModeManager(devModeManager: DevModeManager): void {
		this.devModeManager = devModeManager;
	}

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
