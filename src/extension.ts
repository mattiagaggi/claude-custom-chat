/**
 * Claude Code Chat Extension
 * A clean, minimal VS Code extension providing a chat interface for Claude Code CLI
 */

import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as path from 'path';
import getHtml from './ui';
import { ProcessManager, ConversationManager, PermissionManager } from './managers';
import { WebviewMessageHandler, StreamParser } from './handlers';

// Diff content storage for read-only diff views
const diffContentStore = new Map<string, string>();

class DiffContentProvider implements vscode.TextDocumentContentProvider {
	provideTextDocumentContent(uri: vscode.Uri): string {
		return diffContentStore.get(uri.path) || '';
	}
}

export function activate(context: vscode.ExtensionContext) {
	// Create multiple providers for multi-chat support
	const providers = [
		new ClaudeChatProvider(context.extensionUri, context, 1),
		new ClaudeChatProvider(context.extensionUri, context, 2),
		new ClaudeChatProvider(context.extensionUri, context, 3)
	];

	context.subscriptions.push(
		// Main command - opens in column Two
		vscode.commands.registerCommand('claude-code-chat.openChat', (column?: vscode.ViewColumn) => {
			providers[0].show(column || vscode.ViewColumn.Two);
		}),
		// Open chat in column One (left)
		vscode.commands.registerCommand('claude-code-chat.openChat1', () => {
			providers[0].show(vscode.ViewColumn.One);
		}),
		// Open chat in column Two (center)
		vscode.commands.registerCommand('claude-code-chat.openChat2', () => {
			providers[1].show(vscode.ViewColumn.Two);
		}),
		// Open chat in column Three (right)
		vscode.commands.registerCommand('claude-code-chat.openChat3', () => {
			providers[2].show(vscode.ViewColumn.Three);
		}),
		vscode.commands.registerCommand('claude-code-chat.loadConversation', (filename: string) => {
			providers[0].loadConversation(filename);
		}),
		vscode.window.registerWebviewViewProvider('claude-code-chat.chat',
			new ClaudeChatWebviewProvider(context.extensionUri, context, providers[0])
		),
		vscode.workspace.registerTextDocumentContentProvider('claude-diff', new DiffContentProvider()),
		vscode.workspace.onDidChangeConfiguration(event => {
			if (event.affectsConfiguration('claudeCodeChat.wsl')) {
				providers.forEach(p => p.newSession());
			}
		})
	);

	// Status bar
	const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
	statusBar.text = "Claude";
	statusBar.tooltip = "Open Claude Code Chat (Ctrl+Shift+C)";
	statusBar.command = 'claude-code-chat.openChat';
	statusBar.show();
	context.subscriptions.push(statusBar);
}

export function deactivate() {}

/**
 * Webview provider for sidebar
 */
class ClaudeChatWebviewProvider implements vscode.WebviewViewProvider {
	constructor(
		private readonly extensionUri: vscode.Uri,
		private readonly context: vscode.ExtensionContext,
		private readonly chatProvider: ClaudeChatProvider
	) {}

	resolveWebviewView(webviewView: vscode.WebviewView) {
		webviewView.webview.options = {
			enableScripts: true,
			localResourceRoots: [this.extensionUri]
		};

		this.chatProvider.showInWebview(webviewView.webview, webviewView);

		webviewView.onDidChangeVisibility(() => {
			if (webviewView.visible) {
				if (this.chatProvider.panel) {
					this.chatProvider.panel.dispose();
					this.chatProvider.panel = undefined;
				}
				this.chatProvider.reinitialize();
			}
		});
	}
}

/**
 * Main chat provider - coordinates all functionality
 */
class ClaudeChatProvider {
	public panel: vscode.WebviewPanel | undefined;
	private webview: vscode.Webview | undefined;
	private webviewView: vscode.WebviewView | undefined;
	private messageHandlerDisposable: vscode.Disposable | undefined;

	// Managers
	private processManager: ProcessManager;
	private conversationManager: ConversationManager;
	private permissionManager: PermissionManager;
	private messageHandler: WebviewMessageHandler;
	private streamParser: StreamParser;

	// State
	private currentProcess: cp.ChildProcess | undefined;
	private isProcessing = false;
	private selectedModel = 'default';
	private pendingPermissions = new Map<string, any>();
	private chatNumber: number;

	constructor(
		private readonly extensionUri: vscode.Uri,
		private readonly context: vscode.ExtensionContext,
		chatNumber: number = 1
	) {
		this.chatNumber = chatNumber;
		// Initialize managers
		this.processManager = new ProcessManager();
		this.conversationManager = new ConversationManager(context);
		this.permissionManager = new PermissionManager(context);

		// Initialize handlers
		this.messageHandler = new WebviewMessageHandler(context, this.createMessageCallbacks());
		this.streamParser = new StreamParser(this.createStreamCallbacks());

		// Load saved state
		this.selectedModel = context.workspaceState.get('claude.selectedModel', 'default');
	}

	/**
	 * Show chat in panel
	 */
	show(column: vscode.ViewColumn | vscode.Uri = vscode.ViewColumn.Two) {
		const actualColumn = column instanceof vscode.Uri ? vscode.ViewColumn.Two : column;

		if (this.webviewView) {
			this.webviewView = undefined;
		}

		if (this.panel) {
			this.panel.reveal(actualColumn);
			return;
		}

		this.panel = vscode.window.createWebviewPanel(
			'claudeChat',
			`Claude Code Chat ${this.chatNumber > 1 ? this.chatNumber : ''}`.trim(),
			actualColumn,
			{
				enableScripts: true,
				retainContextWhenHidden: true,
				localResourceRoots: [this.extensionUri]
			}
		);

		this.panel.iconPath = vscode.Uri.joinPath(this.extensionUri, 'icon-bubble.png');
		this.panel.webview.html = this.getHtml(this.panel.webview);

		this.setupWebview(this.panel.webview);

		this.panel.onDidDispose(() => {
			this.panel = undefined;
			this.messageHandlerDisposable?.dispose();
		});

		this.sendReady();
	}

	/**
	 * Show chat in webview (sidebar)
	 */
	showInWebview(webview: vscode.Webview, view?: vscode.WebviewView) {
		if (this.panel) {
			this.panel.dispose();
			this.panel = undefined;
		}

		this.webview = webview;
		this.webviewView = view;
		webview.html = this.getHtml(webview);
		this.setupWebview(webview);
		this.sendReady();
	}

	/**
	 * Reinitialize after visibility change
	 */
	reinitialize() {
		this.sendReady();
	}

	/**
	 * Setup webview message handler
	 */
	private setupWebview(webview: vscode.Webview) {
		this.messageHandlerDisposable?.dispose();
		this.messageHandlerDisposable = webview.onDidReceiveMessage(msg => this.handleWebviewMessage(msg));
	}

	/**
	 * Handle messages from webview
	 */
	private async handleWebviewMessage(message: any) {
		// Handle messages that need special treatment
		switch (message.type) {
			case 'getConversationList':
				return this.sendConversationList();
			case 'getWorkspaceFiles':
				return this.sendWorkspaceFiles(message.searchTerm);
			case 'getSettings':
				return this.sendSettings();
			case 'updateSettings':
				return this.updateSettings(message.settings);
			case 'getClipboardText':
				return this.getClipboardText();
			case 'getPermissions':
				return this.sendPermissions();
			case 'getCustomSnippets':
				return this.sendCustomSnippets();
			case 'enableYoloMode':
				return this.enableYoloMode();
			case 'openDiffByIndex':
				return this.openDiffByIndex(message.messageIndex);
			case 'createImageFile':
				return this.createImageFile(message.imageData, message.imageType);
		}

		// Delegate to message handler
		await this.messageHandler.handleMessage(message);
	}

	/**
	 * Create message handler callbacks
	 */
	private createMessageCallbacks() {
		return {
			onSendMessage: (text: string, planMode?: boolean, thinkingMode?: boolean) =>
				this.sendMessageToClaude(text, planMode, thinkingMode),
			onNewSession: () => this.newSession(),
			onStopRequest: () => this.stopProcess(),
			onLoadConversation: (filename: string) => this.loadConversation(filename),
			onSetModel: (model: string) => this.setModel(model),
			onOpenModelTerminal: () => this.openModelTerminal(),
			onOpenUsageTerminal: (usageType: string) => this.openUsageTerminal(usageType),
			onRunInstallCommand: () => this.runInstallCommand(),
			onExecuteSlashCommand: (command: string) => this.executeSlashCommand(command),
			onOpenDiff: (filePath: string, oldContent: string, newContent: string) =>
				this.openDiff(filePath, oldContent, newContent),
			onOpenFile: (filePath: string) => this.openFile(filePath),
			onSelectImage: () => this.selectImage(),
			onPermissionResponse: (id: string, approved: boolean, alwaysAllow?: boolean) =>
				this.handlePermissionResponse(id, approved, alwaysAllow),
			onSaveInputText: (text: string) => this.saveInputText(text),
			onDismissWSLAlert: () => this.dismissWSLAlert(),
			onSendPermissions: () => this.sendPermissions(),
			onRemovePermission: (toolName: string, command: string | null) =>
				this.permissionManager.removePermission(toolName, command || ''),
			onAddPermission: (toolName: string, command: string | null) =>
				this.addPermission(toolName, command),
			onLoadMCPServers: () => this.loadMCPServers(),
			onSaveMCPServer: (name: string, config: any) => this.saveMCPServer(name, config),
			onDeleteMCPServer: (name: string) => this.deleteMCPServer(name),
			onSendCustomSnippets: () => this.sendCustomSnippets(),
			onSaveCustomSnippet: (snippet: any) => this.saveCustomSnippet(snippet),
			onDeleteCustomSnippet: (snippetId: string) => this.deleteCustomSnippet(snippetId)
		};
	}

	/**
	 * Create stream parser callbacks
	 */
	private createStreamCallbacks() {
		return {
			onSessionStart: (sessionId: string) => {
				this.conversationManager.setSessionId(sessionId);
			},
			onToolUse: (data: any) => {
				this.sendAndSaveMessage({ type: 'toolUse', data });
			},
			onToolResult: (data: any) => {
				this.sendAndSaveMessage({ type: 'toolResult', data });
			},
			onTextDelta: (text: string) => {
				this.postMessage({ type: 'textDelta', data: text });
			},
			onMessage: (content: string) => {
				this.sendAndSaveMessage({ type: 'assistantMessage', data: content });
			},
			onTokenUsage: (inputTokens: number, outputTokens: number) => {
				this.conversationManager.updateUsage(0, inputTokens, outputTokens);
			},
			onCostUpdate: (cost: number) => {
				this.conversationManager.updateUsage(cost, 0, 0);
			},
			onResult: (data: any) => {
				this.postMessage({ type: 'result', data });
				this.postMessage({ type: 'setProcessing', data: { isProcessing: false } });
				this.postMessage({ type: 'clearLoading' });
				this.isProcessing = false;
			},
			onError: (error: string) => {
				this.sendAndSaveMessage({ type: 'error', data: error });
			},
			onAccountInfo: (info: any) => {
				if (info.subscription_type) {
					this.context.globalState.update('claude.subscriptionType', info.subscription_type);
				}
			},
			onControlRequest: (request: any) => {
				this.handleControlRequest(request);
			},
			onControlResponse: (response: any) => {
				// Handle control responses if needed
			}
		};
	}

	/**
	 * Send message to Claude
	 */
	private async sendMessageToClaude(message: string, planMode?: boolean, thinkingMode?: boolean) {
		// Cancel current operation if running
		if (this.isProcessing) {
			await this.stopProcess();
			this.sendAndSaveMessage({
				type: 'assistantMessage',
				data: '⚠️ _Previous operation cancelled - starting new request..._'
			});
		}

		const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
		const cwd = workspaceFolder ? workspaceFolder.uri.fsPath : process.cwd();

		// Build args
		const args = [
			'--output-format', 'stream-json',
			'--input-format', 'stream-json',
			'--verbose'
		];

		// Add configuration
		const config = vscode.workspace.getConfiguration('claudeCodeChat');
		const yoloMode = config.get<boolean>('permissions.yoloMode', false);

		if (yoloMode) {
			args.push('--dangerously-skip-permissions');
		} else {
			args.push('--permission-prompt-tool', 'stdio');
		}

		// Add MCP config
		const mcpConfigPath = this.getMCPConfigPath();
		if (mcpConfigPath) {
			args.push('--mcp-config', mcpConfigPath);
		}

		// Add plan mode
		if (planMode) {
			args.push('--permission-mode', 'plan');
		}

		// Add thinking mode
		if (thinkingMode) {
			const intensity = config.get<string>('thinking.intensity', 'think');
			message = `${intensity.toUpperCase().replace('-', ' ')} THROUGH THIS STEP BY STEP: \n${message}`;
		}

		// Add model
		if (this.selectedModel && this.selectedModel !== 'default') {
			args.push('--model', this.selectedModel);
		}

		// Add session resume
		const session = this.conversationManager.getCurrentSession();
		if (session.sessionId) {
			args.push('--resume', session.sessionId);
		}

		this.isProcessing = true;

		// Show user input
		this.sendAndSaveMessage({ type: 'userInput', data: message });
		this.postMessage({ type: 'setProcessing', data: { isProcessing: true } });
		this.postMessage({ type: 'loading', data: 'Claude is working...' });

		try {
			// Spawn process
			const process = await this.processManager.spawn({
				args,
				cwd,
				wslEnabled: config.get('wsl.enabled', false),
				wslDistro: config.get('wsl.distro', 'Ubuntu'),
				nodePath: config.get('wsl.nodePath', '/usr/bin/node'),
				claudePath: config.get('wsl.claudePath', '/usr/local/bin/claude')
			});

			this.currentProcess = process;

			// Write message to stdin
			const userMessage = {
				type: 'user',
				session_id: session.sessionId || '',
				message: {
					role: 'user',
					content: [{ type: 'text', text: message }]
				},
				parent_tool_use_id: null
			};
			console.log('[Extension] Sending message to Claude:', JSON.stringify(userMessage));
			this.processManager.write(JSON.stringify(userMessage) + '\n');

			// Handle stdout
			process.stdout?.on('data', (data) => {
				console.log('[Extension] Claude stdout:', data.toString().substring(0, 200));
				this.streamParser.parseChunk(data.toString());
			});

			// Handle stderr
			process.stderr?.on('data', (data) => {
				const error = data.toString();
				console.error('[Extension] Claude stderr:', error);
				if (error.trim()) {
					this.postMessage({ type: 'error', data: `[CLI Error] ${error}` });
				}
			});

			// Handle close
			process.on('close', (code) => {
				console.log('[Extension] Claude process closed with code:', code);
				this.currentProcess = undefined;
				this.postMessage({ type: 'clearLoading' });
				this.postMessage({ type: 'setProcessing', data: { isProcessing: false } });
				this.isProcessing = false;
				this.permissionManager.cancelAllPending();
			});

			// Handle error
			process.on('error', (error) => {
				console.error('[Extension] Claude process error:', error);
				this.currentProcess = undefined;
				this.postMessage({ type: 'clearLoading' });
				this.postMessage({ type: 'setProcessing', data: { isProcessing: false } });
				this.isProcessing = false;

				if (error.message.includes('ENOENT')) {
					this.postMessage({ type: 'showInstallModal' });
				} else {
					this.sendAndSaveMessage({ type: 'error', data: `Error: ${error.message}` });
				}
			});

		} catch (error: any) {
			this.postMessage({ type: 'clearLoading' });
			this.postMessage({ type: 'setProcessing', data: { isProcessing: false } });
			this.isProcessing = false;
			this.sendAndSaveMessage({ type: 'error', data: `Failed to start: ${error.message}` });
		}
	}

	/**
	 * Handle control request (permission prompt)
	 */
	private async handleControlRequest(requestData: any) {
		const request_id = requestData.request_id;
		const tool_name = requestData.request?.tool_name || requestData.tool_name;
		const input = requestData.request?.input || requestData.input;

		console.log('[Extension] Control request:', { request_id, tool_name, input });

		// Check if auto-approved
		if (await this.permissionManager.shouldAutoApprove(tool_name, input)) {
			this.sendPermissionResponse(request_id, true);
			return;
		}

		// Store pending request
		this.pendingPermissions.set(request_id, requestData);

		// Show UI prompt
		this.postMessage({
			type: 'permissionRequest',
			data: {
				id: request_id,
				toolName: tool_name,
				input,
				suggestions: requestData.request?.suggestions || requestData.suggestions
			}
		});
	}

	/**
	 * Handle permission response from UI
	 */
	private handlePermissionResponse(id: string, approved: boolean, alwaysAllow?: boolean) {
		const request = this.pendingPermissions.get(id);
		if (!request) return;

		const tool_name = request.request?.tool_name || request.tool_name;
		const input = request.request?.input || request.input;

		if (approved && alwaysAllow) {
			this.permissionManager.addAlwaysAllowPermission(tool_name, input);
		}

		this.sendPermissionResponse(id, approved);
		this.pendingPermissions.delete(id);
	}

	/**
	 * Send permission response to Claude
	 */
	private sendPermissionResponse(requestId: string, approved: boolean) {
		const response = {
			type: 'control_response',
			response: approved ? { approved: true } : { error: 'Permission denied' }
		};

		this.processManager.write(JSON.stringify({ ...response, request_id: requestId }) + '\n');
		this.postMessage({ type: 'permissionUpdate', data: { id: requestId, status: approved ? 'approved' : 'denied' } });
	}

	/**
	 * Stop current process
	 */
	private async stopProcess() {
		await this.processManager.terminate();
		this.currentProcess = undefined;
		this.isProcessing = false;
		this.permissionManager.cancelAllPending();
		this.pendingPermissions.clear();
	}

	/**
	 * Start new session
	 */
	async newSession() {
		await this.stopProcess();

		// Save current conversation before starting new one
		await this.conversationManager.saveConversation();

		this.conversationManager.startConversation();
		this.postMessage({ type: 'sessionCleared' });
		this.postMessage({ type: 'setProcessing', data: { isProcessing: false } });
	}

	/**
	 * Load conversation
	 */
	async loadConversation(filename: string) {
		// Save current conversation before loading another
		await this.conversationManager.saveConversation();

		// Load the conversation
		const conversation = await this.conversationManager.loadConversation(filename);
		if (conversation) {
			// Send conversation data to webview
			this.postMessage({ type: 'conversationLoaded', data: conversation });

			// Update session info
			const session = this.conversationManager.getCurrentSession();
			this.postMessage({
				type: 'sessionInfo',
				data: {
					sessionId: session.sessionId,
					totalTokensInput: session.totalTokensInput,
					totalTokensOutput: session.totalTokensOutput,
					totalCost: session.totalCost,
					requestCount: session.messageCount
				}
			});
		}
	}

	/**
	 * Send and save message
	 */
	private sendAndSaveMessage(message: { type: string; data: any }) {
		this.postMessage(message);
		this.conversationManager.addMessage(message.type, message.data);
	}

	/**
	 * Post message to webview
	 */
	private postMessage(message: any) {
		const target = this.panel?.webview || this.webview;
		target?.postMessage(message);
	}

	/**
	 * Send ready message
	 */
	private sendReady() {
		const message = this.isProcessing
			? 'Claude is working...'
			: 'Ready to chat with Claude Code! Type your message below.';
		this.postMessage({ type: 'ready', data: message });
		this.sendConversationList();
		this.sendSettings();
		this.sendPlatformInfo();
	}

	/**
	 * Get HTML for webview
	 */
	private getHtml(webview: vscode.Webview): string {
		const cssUri = webview.asWebviewUri(
			vscode.Uri.joinPath(this.extensionUri, 'out', 'webview', 'styles.css')
		).toString();

		const scriptUri = webview.asWebviewUri(
			vscode.Uri.joinPath(this.extensionUri, 'out', 'webview', 'script.js')
		).toString();

		return getHtml(vscode.env?.isTelemetryEnabled, cssUri, scriptUri);
	}

	// Simplified helper methods (implementation details)
	private sendConversationList() {
		const conversations = this.conversationManager.getConversationList();
		this.postMessage({ type: 'conversationList', data: conversations });
	}

	private sendWorkspaceFiles(searchTerm: string) {
		// Implementation would search workspace files
		this.postMessage({ type: 'workspaceFiles', data: [] });
	}

	private sendSettings() {
		const config = vscode.workspace.getConfiguration('claudeCodeChat');
		this.postMessage({
			type: 'settings',
			data: {
				'thinking.intensity': config.get('thinking.intensity', 'think'),
				'wsl.enabled': config.get('wsl.enabled', false),
				'wsl.distro': config.get('wsl.distro', 'Ubuntu'),
				'permissions.yoloMode': config.get('permissions.yoloMode', false)
			}
		});
	}

	private updateSettings(settings: any) {
		const config = vscode.workspace.getConfiguration('claudeCodeChat');
		for (const [key, value] of Object.entries(settings)) {
			config.update(key, value, vscode.ConfigurationTarget.Global);
		}
	}

	private getClipboardText() {
		vscode.env.clipboard.readText().then(text => {
			this.postMessage({ type: 'clipboardText', data: text });
		});
	}

	private async sendPermissions() {
		const permissions = this.permissionManager.getAllPermissions();
		this.postMessage({ type: 'permissions', data: permissions });
	}

	private async sendCustomSnippets() {
		// Implementation would load custom snippets
		this.postMessage({ type: 'customSnippets', data: {} });
	}

	private enableYoloMode() {
		const config = vscode.workspace.getConfiguration('claudeCodeChat');
		config.update('permissions.yoloMode', true, vscode.ConfigurationTarget.Global);
	}

	private async addPermission(toolName: string, command: string | null) {
		// Implementation
	}

	private async loadMCPServers() {
		// Implementation
	}

	private async saveMCPServer(name: string, config: any) {
		// Implementation
	}

	private async deleteMCPServer(name: string) {
		// Implementation
	}

	private async saveCustomSnippet(snippet: any) {
		// Implementation
	}

	private async deleteCustomSnippet(snippetId: string) {
		// Implementation
	}

	private setModel(model: string) {
		this.selectedModel = model;
		this.context.workspaceState.update('claude.selectedModel', model);
	}

	private openModelTerminal() {
		const terminal = vscode.window.createTerminal('Claude Model');
		terminal.show();
		terminal.sendText('claude --help');
	}

	private openUsageTerminal(usageType: string) {
		const terminal = vscode.window.createTerminal('Claude Usage');
		terminal.show();
		terminal.sendText(`claude usage ${usageType}`);
	}

	private runInstallCommand() {
		const terminal = vscode.window.createTerminal('Install Claude');
		terminal.show();
		terminal.sendText('npm install -g @anthropic/claude');
	}

	private executeSlashCommand(command: string) {
		// Execute slash command
		this.postMessage({ type: 'slashCommandExecuted', data: { command } });
	}

	private openDiff(filePath: string, oldContent: string, newContent: string) {
		const fileName = path.basename(filePath);
		diffContentStore.set(`${filePath}?old`, oldContent);
		diffContentStore.set(`${filePath}?new`, newContent);

		const leftUri = vscode.Uri.parse(`claude-diff:${filePath}?old`);
		const rightUri = vscode.Uri.parse(`claude-diff:${filePath}?new`);

		vscode.commands.executeCommand('vscode.diff', leftUri, rightUri, `${fileName} (Claude's changes)`);
	}

	private openFile(filePath: string) {
		vscode.window.showTextDocument(vscode.Uri.file(filePath));
	}

	private async selectImage() {
		const result = await vscode.window.showOpenDialog({
			canSelectFiles: true,
			canSelectMany: false,
			filters: { 'Images': ['png', 'jpg', 'jpeg', 'gif', 'webp'] }
		});

		if (result?.[0]) {
			this.postMessage({ type: 'imageSelected', data: result[0].fsPath });
		}
	}

	private saveInputText(text: string) {
		// Save draft
	}

	private dismissWSLAlert() {
		this.context.globalState.update('wslAlertDismissed', true);
	}

	private openDiffByIndex(index: number) {
		// Open diff by message index
	}

	private createImageFile(imageData: string, imageType: string) {
		// Create image file from base64 data
	}

	private sendPlatformInfo() {
		this.postMessage({
			type: 'platformInfo',
			data: { platform: process.platform }
		});
	}

	private getMCPConfigPath(): string | undefined {
		const homeDir = require('os').homedir();
		const storagePath = path.join(homeDir, '.claude');
		return path.join(storagePath, 'mcp', 'mcp-servers.json');
	}

	async dispose() {
		// Save conversation before disposal
		await this.conversationManager.saveConversation();

		// Clean up process
		this.processManager.terminate();

		// Dispose of panel
		if (this.panel) {
			this.panel.dispose();
		}
	}
}
