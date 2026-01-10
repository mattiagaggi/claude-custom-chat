/**
 * Claude Code Chat Extension
 * A clean, minimal VS Code extension providing a chat interface for Claude Code CLI
 */

import * as vscode from 'vscode';
import * as cp from 'child_process';
import getHtml from './ui';
import { ProcessManager, ConversationManager, PermissionManager } from './managers';
import {
	WebviewMessageHandler,
	StreamParser,
	MCPHandler,
	ConversationHandler,
	PermissionRequestHandler,
	createStreamCallbacks,
	DiffContentProvider,
	openDiff as utilOpenDiff,
	openFile as utilOpenFile,
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

export function deactivate() { }

/**
 * Webview provider for sidebar
 */
class ClaudeChatWebviewProvider implements vscode.WebviewViewProvider {
	constructor(
		private readonly extensionUri: vscode.Uri,
		private readonly context: vscode.ExtensionContext,
		private readonly chatProvider: ClaudeChatProvider
	) { }

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
	private mcpHandler: MCPHandler;
	private conversationHandler: ConversationHandler;
	private permissionRequestHandler: PermissionRequestHandler;

	// State
	private currentProcess: cp.ChildProcess | undefined;
	private selectedModel = 'default';
	private chatNumber: number;

	// Conversation state
	private currentConversationId: string | undefined;

	// Streaming state per conversation - accumulated text for replay on visibility/conversation change
	private conversationStreamingText: Map<string, string> = new Map();

	// Track which conversations have active processes (supports multiple concurrent processes)
	private processingConversationIds: Set<string> = new Set();

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
		this.mcpHandler = new MCPHandler();
		this.permissionRequestHandler = new PermissionRequestHandler({
			permissionManager: this.permissionManager,
			processManager: this.processManager,
			postMessage: (msg) => this.postMessage(msg)
		});
		this.messageHandler = new WebviewMessageHandler(context, this.createMessageCallbacks());

		// Initialize conversation handler
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

		// Initialize stream parser with factory
		this.streamParser = new StreamParser(createStreamCallbacks({
			conversationManager: this.conversationManager,
			context: this.context,
			postMessage: (msg) => this.postMessage(msg),
			getCurrentConversationId: () => this.currentConversationId,
			getProcessingConversationId: () => this.currentConversationId && this.processingConversationIds.has(this.currentConversationId) ? this.currentConversationId : undefined,
			isProcessing: () => this.processingConversationIds.size > 0,
			setProcessingState: (isProcessing, conversationId) => {
				if (isProcessing && conversationId) {
					this.processingConversationIds.add(conversationId);
				} else if (!isProcessing && conversationId) {
					this.processingConversationIds.delete(conversationId);
				}
			},
			getStreamingText: (id) => this.conversationStreamingText.get(id),
			setStreamingText: (id, text) => this.conversationStreamingText.set(id, text),
			deleteStreamingText: (id) => this.conversationStreamingText.delete(id),
			onControlRequest: (request) => this.handleControlRequest(request)
		}));

		// Load saved state
		this.selectedModel = context.workspaceState.get('claude.selectedModel', 'default');

		// Set initial conversation ID from conversation manager
		this.currentConversationId = this.conversationManager.getActiveConversationId();
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

		// If we're viewing a conversation that's currently processing
		if (this.currentConversationId && this.processingConversationIds.has(this.currentConversationId)) {
			// Get accumulated streaming text for this conversation
			const streamingText = this.conversationStreamingText.get(this.currentConversationId);
			if (streamingText) {
				// Send accumulated text as a single chunk so webview can render it
				this.postMessage({ type: 'streamingReplay', data: streamingText, conversationId: this.currentConversationId });
			}
			// Restore processing state
			this.postMessage({
				type: 'setProcessing',
				data: { isProcessing: true, requestStartTime: Date.now() },
				conversationId: this.currentConversationId
			});
		}

		// Resend any pending permission requests so they appear in the UI
		this.permissionRequestHandler.resendPendingPermissions();
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
			case 'ready':
				// Webview has loaded/reloaded - send current state
				return this.handleWebviewReady();
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
			case 'selectImageFile':
				return this.selectImageFile();
			case 'copyToClipboard':
				return vscode.env.clipboard.writeText(message.text);
		}

		// Delegate to message handler
		await this.messageHandler.handleMessage(message);
	}

	/**
	 * Create message handler callbacks
	 */
	private createMessageCallbacks() {
		return {
			onSendMessage: (text: string, planMode?: boolean, thinkingMode?: boolean, skipUIDisplay?: boolean) =>
				this.sendMessageToClaude(text, planMode, thinkingMode, skipUIDisplay),
			onNewSession: () => this.newSession(),
			onStopRequest: () => this.stopCurrentConversationProcess(),
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
			onUserQuestionResponse: (id: string, answers: Record<string, string>) =>
				this.handleUserQuestionResponse(id, answers),
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
			onDeleteCustomSnippet: (snippetId: string) => this.deleteCustomSnippet(snippetId),
			onGetActiveConversations: () => this.sendActiveConversations(),
			onSwitchConversation: (conversationId: string) => this.switchConversation(conversationId),
			onCloseConversation: (conversationId: string) => this.closeConversation(conversationId),
			onStopConversation: (conversationId: string) => this.stopConversationProcess(conversationId),
			onOpenConversationInNewPanel: (filename: string) => this.openConversationInNewPanel(filename)
		};
	}

	/**
	 * Send message to Claude
	 * Supports concurrent processes - each conversation can have its own running process
	 */
	private async sendMessageToClaude(message: string, _planMode?: boolean, thinkingMode?: boolean, skipUIDisplay?: boolean) {
		// Check if THIS conversation already has a running process
		// If so, stop it before starting a new one (but don't stop OTHER conversations)
		if (this.currentConversationId && this.processingConversationIds.has(this.currentConversationId)) {
			await this.stopConversationProcess(this.currentConversationId);
			this.sendAndSaveMessage({
				type: 'assistantMessage',
				data: '⚠️ _Previous operation cancelled - starting new request..._'
			});
		}

		const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
		const cwd = workspaceFolder ? workspaceFolder.uri.fsPath : process.cwd();

		// Build args
		// --print is required for non-interactive mode to properly execute tools
		// --include-partial-messages enables streaming text_delta events
		const args = [
			'--print',
			'--output-format', 'stream-json',
			'--input-format', 'stream-json',
			'--verbose',
			'--include-partial-messages'
		];

		// Add configuration
		const config = vscode.workspace.getConfiguration('claudeCodeChat');
		const yoloMode = config.get<boolean>('permissions.yoloMode', false);

		console.log('[Extension] ========== PERMISSION MODE CHECK ==========');
		console.log('[Extension] YOLO Mode enabled:', yoloMode);

		if (yoloMode) {
			args.push('--dangerously-skip-permissions');
			console.log('[Extension] Added --dangerously-skip-permissions flag');
		} else {
			// Use permission-prompt-tool stdio to handle permissions via stdin/stdout
			console.log('[Extension] YOLO mode disabled - using permission-prompt-tool stdio');
			args.push('--permission-prompt-tool', 'stdio');
		}

		// Add MCP config
		const mcpConfigPath = this.getMCPConfigPath();
		if (mcpConfigPath) {
			args.push('--mcp-config', mcpConfigPath);
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

		// Add session resume for this conversation
		const conversation = this.currentConversationId
			? this.conversationManager.getConversation(this.currentConversationId)
			: null;
		const sessionId = conversation?.sessionId;
		if (sessionId) {
			args.push('--resume', sessionId);
		}

		console.log('[Extension] ========== FINAL ARGS CHECK ==========');
		console.log('[Extension] Complete args array:', JSON.stringify(args, null, 2));
		console.log('[Extension] Conversation ID:', this.currentConversationId);

		// Capture the conversation ID at spawn time - this is critical!
		// The process will continue running with this ID even if user switches conversations
		const spawnedConversationId = this.currentConversationId;

		if (!spawnedConversationId) {
			this.postMessage({ type: 'error', data: 'No active conversation' });
			return;
		}

		// Track this conversation as processing
		this.processingConversationIds.add(spawnedConversationId);

		// Show user input (skip if already displayed in UI from queue)
		if (!skipUIDisplay) {
			this.sendAndSaveMessage({ type: 'userInput', data: message });
		} else {
			// Still save to conversation history, just don't post to UI
			this.conversationManager.addMessage('userInput', message, spawnedConversationId);
		}

		// Save conversation immediately so it appears in history list
		// This allows user to click back to it while processing
		await this.conversationManager.saveConversation(spawnedConversationId);
		this.sendConversationList();

		this.postMessage({ type: 'setProcessing', data: { isProcessing: true }, conversationId: spawnedConversationId });
		this.postMessage({ type: 'loading', data: 'Claude is working...', conversationId: spawnedConversationId });

		// Update tabs UI to show this conversation is processing
		this.conversationHandler.sendActiveConversations();

		try {
			// Spawn process for this specific conversation (doesn't affect other conversations)
			const process = await this.processManager.spawnForConversation({
				args,
				cwd,
				wslEnabled: config.get('wsl.enabled', false),
				wslDistro: config.get('wsl.distro', 'Ubuntu'),
				nodePath: config.get('wsl.nodePath', '/usr/bin/node'),
				claudePath: config.get('wsl.claudePath', '/usr/local/bin/claude')
			}, spawnedConversationId);

			// Write message to stdin using conversation-specific write
			const userMessage = {
				type: 'user',
				session_id: sessionId || '',
				message: {
					role: 'user',
					content: [{ type: 'text', text: message }]
				},
				parent_tool_use_id: null
			};
			console.log('[Extension] Sending message to Claude for conversation:', spawnedConversationId);
			this.processManager.writeToConversation(spawnedConversationId, JSON.stringify(userMessage) + '\n');

			// Handle stdout
			// IMPORTANT: Capture spawnedConversationId in closure so this process's data
			// is always associated with the correct conversation, even if user switches tabs
			process.stdout?.on('data', (data) => {
				const dataStr = data.toString();
				console.log('[Extension] Claude stdout received:', dataStr.length, 'bytes', 'for conversation:', spawnedConversationId);
				console.log('[Extension] Claude stdout content:', dataStr.substring(0, 200));

				// Log each complete line
				const lines = dataStr.split('\n').filter((l: string) => l.trim());
				lines.forEach((line: string, idx: number) => {
					console.log(`[Extension] Line ${idx}:`, line.substring(0, 150));
				});

				// Pass the conversationId that was captured at spawn time
				// This ensures data goes to the correct conversation even if user switched tabs
				this.streamParser.parseChunk(dataStr, spawnedConversationId);
			});

			// Handle stderr - use spawnedConversationId for correct conversation association
			process.stderr?.on('data', (data) => {
				const error = data.toString();
				console.error('[Extension] Claude stderr:', error, 'for conversation:', spawnedConversationId);
				if (error.trim()) {
					this.postMessage({ type: 'error', data: `[CLI Error] ${error}`, conversationId: spawnedConversationId });
				}
			});

			// Handle close - use spawnedConversationId for correct conversation association
			process.on('close', (code) => {
				console.log('[Extension] Claude process closed with code:', code, 'for conversation:', spawnedConversationId);

				// Remove from processing set
				this.processingConversationIds.delete(spawnedConversationId);

				// Send with conversationId - webview will filter based on current view
				this.postMessage({ type: 'clearLoading', conversationId: spawnedConversationId });
				this.postMessage({ type: 'setProcessing', data: { isProcessing: false }, conversationId: spawnedConversationId });

				// Update tabs UI
				this.conversationHandler.sendActiveConversations();
			});

			// Handle error - use spawnedConversationId for correct conversation association
			process.on('error', (error) => {
				console.error('[Extension] Claude process error:', error, 'for conversation:', spawnedConversationId);

				// Remove from processing set
				this.processingConversationIds.delete(spawnedConversationId);

				// Send with conversationId - webview will filter based on current view
				this.postMessage({ type: 'clearLoading', conversationId: spawnedConversationId });
				this.postMessage({ type: 'setProcessing', data: { isProcessing: false }, conversationId: spawnedConversationId });

				// Update tabs UI
				this.conversationHandler.sendActiveConversations();

				if (error.message.includes('ENOENT')) {
					this.postMessage({ type: 'showInstallModal' });
				} else {
					this.postMessage({ type: 'error', data: `Error: ${error.message}`, conversationId: spawnedConversationId });
				}
			});

		} catch (error: any) {
			// Remove from processing set on error
			this.processingConversationIds.delete(spawnedConversationId);

			this.postMessage({ type: 'clearLoading', conversationId: spawnedConversationId });
			this.postMessage({ type: 'setProcessing', data: { isProcessing: false }, conversationId: spawnedConversationId });
			this.postMessage({ type: 'error', data: `Failed to start: ${error.message}`, conversationId: spawnedConversationId });

			// Update tabs UI
			this.conversationHandler.sendActiveConversations();
		}
	}

	/**
	 * Handle control request (permission prompt)
	 */
	private async handleControlRequest(requestData: any) {
		await this.permissionRequestHandler.handleControlRequest(requestData);
	}

	/**
	 * Handle permission response from UI
	 */
	private handlePermissionResponse(id: string, approved: boolean, alwaysAllow?: boolean) {
		this.permissionRequestHandler.handlePermissionResponse(id, approved, alwaysAllow);
	}

	/**
	 * Handle user question response from UI
	 */
	private handleUserQuestionResponse(id: string, answers: Record<string, string>) {
		this.permissionRequestHandler.handleUserQuestionResponse(id, answers);
	}

	/**
	 * Stop the current conversation's process (called from stop button)
	 */
	private async stopCurrentConversationProcess() {
		if (this.currentConversationId && this.processingConversationIds.has(this.currentConversationId)) {
			await this.stopConversationProcess(this.currentConversationId);
		}
	}

	/**
	 * Stop a specific conversation's process
	 */
	private async stopConversationProcess(conversationId: string) {
		// Terminate the specific conversation's process
		await this.processManager.terminateConversation(conversationId);

		// Finalize any streaming content before clearing
		const streamingText = this.conversationStreamingText.get(conversationId);
		if (streamingText) {
			// Save the partial streaming content as a completed message
			this.conversationManager.addMessage('assistantMessage', streamingText, conversationId);
			// Notify UI to finalize the streaming display (UI will filter by conversationId)
			this.postMessage({
				type: 'finalizeStreaming',
				data: streamingText,
				conversationId: conversationId
			});
		}
		this.conversationStreamingText.delete(conversationId);

		// Remove from processing set
		this.processingConversationIds.delete(conversationId);

		// Update UI
		this.postMessage({ type: 'clearLoading', conversationId });
		this.postMessage({ type: 'setProcessing', data: { isProcessing: false }, conversationId });

		// Update tabs UI
		this.conversationHandler.sendActiveConversations();
	}

	/**
	 * Stop all processes (used for cleanup)
	 */
	private async stopAllProcesses() {
		const processingIds = Array.from(this.processingConversationIds);
		for (const convId of processingIds) {
			await this.stopConversationProcess(convId);
		}
		this.permissionManager.cancelAllPending();
		this.permissionRequestHandler.clearPending();
	}

	/**
	 * Start new session
	 * Note: Does NOT stop the current process - it continues running in the background
	 * for the previous conversation. The user can switch back to it later.
	 */
	async newSession() {
		// DON'T stop the process - let it continue in background for the previous conversation
		// await this.stopProcess();

		// Save current conversation before starting new one
		await this.conversationManager.saveConversation();

		// Prune old conversations (keep max 100)
		await this.conversationManager.pruneOldConversations(100);

		this.conversationManager.startConversation();

		// Update current conversation ID (this is what the user is now viewing)
		this.currentConversationId = this.conversationManager.getActiveConversationId();

		this.postMessage({
			type: 'sessionCleared',
			conversationId: this.currentConversationId
		});
		// The new conversation is not processing (the old one might still be)
		this.postMessage({ type: 'setProcessing', data: { isProcessing: false }, conversationId: this.currentConversationId });

		// Refresh conversation history
		this.sendConversationList();

		// Update tabs UI with the new conversation
		this.sendActiveConversations();
	}

	/**
	 * Load conversation (from history)
	 */
	async loadConversation(filename: string) {
		// Check if we're loading a conversation that's currently processing
		const convIdForFilename = this.conversationManager.getConversationIdForFilename(filename);
		const isProcessingConv = convIdForFilename ? this.processingConversationIds.has(convIdForFilename) : false;
		await this.conversationHandler.loadConversation(filename, {
			isProcessing: isProcessingConv,
			processingConversationId: isProcessingConv ? convIdForFilename : undefined
		});
		// Resend any pending permission requests so they appear in the UI
		this.permissionRequestHandler.resendPendingPermissions();
	}

	/**
	 * Send and save message
	 */
	private sendAndSaveMessage(message: { type: string; data: any }, conversationId?: string) {
		this.postMessage(message);
		const targetId = conversationId || this.currentConversationId;
		this.conversationManager.addMessage(message.type, message.data, targetId);
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
		const isCurrentProcessing = this.currentConversationId && this.processingConversationIds.has(this.currentConversationId);
		const message = isCurrentProcessing
			? 'Claude is working...'
			: 'Ready to chat with Claude Code! Type your message below.';
		this.postMessage({ type: 'ready', data: message });
		this.sendConversationList();
		this.sendSettings();
		this.sendPlatformInfo();
		// Send current conversation ID so webview knows which conversation is active
		if (this.currentConversationId) {
			this.postMessage({
				type: 'conversationSwitched',
				conversationId: this.currentConversationId
			});
		}
		this.sendCurrentUsage();
	}

	/**
	 * Handle webview ready message - restore state when webview loads/reloads
	 */
	private handleWebviewReady() {
		console.log('[Extension] handleWebviewReady called');
		// Reinitialize sends all necessary state to the webview
		this.reinitialize();
	}

	/**
	 * Send current conversation's usage stats to webview
	 */
	private sendCurrentUsage() {
		console.log('[Extension] sendCurrentUsage called, currentConversationId:', this.currentConversationId);
		const conversation = this.currentConversationId
			? this.conversationManager.getConversation(this.currentConversationId)
			: null;

		console.log('[Extension] sendCurrentUsage conversation found:', !!conversation, 'tokens:', conversation?.totalTokensInput, conversation?.totalTokensOutput);

		if (conversation) {
			// Count messages to get request count (user messages = requests)
			const requestCount = conversation.messages?.filter(
				(m: any) => m.messageType === 'userInput'
			).length || 0;

			this.postMessage({
				type: 'usage',
				data: {
					inputTokens: conversation.totalTokensInput || 0,
					outputTokens: conversation.totalTokensOutput || 0,
					totalCost: conversation.totalCost || 0,
					requestCount: requestCount,
					isInitialLoad: true
				},
				conversationId: this.currentConversationId
			});
		} else {
			console.log('[Extension] sendCurrentUsage: No conversation found, not sending usage');
		}
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
	private getConversationListWithProcessingState() {
		const conversations = this.conversationManager.getConversationList();
		// Add processing state to each conversation
		// Show green dot if: conversation is processing OR is the current active conversation
		return conversations.map(conv => {
			const convId = this.conversationManager.getConversationIdForFilename(conv.filename);
			const isActiveConversation = convId === this.currentConversationId;
			const isProcessingConversation = convId ? this.processingConversationIds.has(convId) : false;
			return {
				...conv,
				isProcessing: isActiveConversation || isProcessingConversation
			};
		});
	}

	private sendConversationList() {
		const conversations = this.getConversationListWithProcessingState();
		console.log('[Extension] Sending conversation list:', conversations.length, 'conversations');
		this.postMessage({ type: 'conversationList', data: conversations });
	}

	private sendWorkspaceFiles(searchTerm: string) {
		// Implementation would search workspace files
		this.postMessage({ type: 'workspaceFiles', data: [] });
	}

	private sendSettings() {
		this.postMessage({ type: 'settings', data: utilGetSettings() });
	}

	private updateSettings(settings: any) {
		utilUpdateSettings(settings);
	}

	private async getClipboardText() {
		const text = await utilGetClipboardText();
		this.postMessage({ type: 'clipboardText', data: text });
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
		utilEnableYoloMode();
	}

	private async addPermission(toolName: string, command: string | null) {
		// Create input object based on tool type
		const input: Record<string, unknown> = {};

		if (toolName === 'Bash' && command) {
			input.command = command;
		} else if ((toolName === 'Read' || toolName === 'Write' || toolName === 'Edit') && command) {
			input.file_path = command;
		}

		// Add to permission manager
		await this.permissionManager.addAlwaysAllowPermission(toolName, input);

		// Send updated permissions back to UI
		await this.sendPermissions();
	}

	private async loadMCPServers() {
		const servers = await this.mcpHandler.loadServers();
		this.postMessage({ type: 'mcpServersLoaded', servers });
	}

	private async saveMCPServer(name: string, config: any) {
		const success = await this.mcpHandler.saveServer(name, config);
		if (success) {
			this.loadMCPServers();
		}
	}

	private async deleteMCPServer(name: string) {
		const success = await this.mcpHandler.deleteServer(name);
		if (success) {
			this.loadMCPServers();
		}
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
		openTerminal('Claude Model', 'claude --help');
	}

	private openUsageTerminal(usageType: string) {
		openTerminal('Claude Usage', `claude usage ${usageType}`);
	}

	private runInstallCommand() {
		openTerminal('Install Claude', 'npm install -g @anthropic/claude');
	}

	private executeSlashCommand(command: string) {
		// Execute slash command
		this.postMessage({ type: 'slashCommandExecuted', data: { command } });
	}

	private openDiff(filePath: string, oldContent: string, newContent: string) {
		utilOpenDiff(filePath, oldContent, newContent);
	}

	private openFile(filePath: string) {
		utilOpenFile(filePath);
	}

	private async selectImage() {
		const filePath = await utilSelectImage();
		if (filePath) {
			this.postMessage({ type: 'imageSelected', data: filePath });
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
		const filePath = utilCreateImageFile(imageData, imageType);
		this.postMessage({ type: 'imagePath', path: filePath });
	}

	private async selectImageFile() {
		const filePath = await utilSelectImageFile();
		if (filePath) {
			this.postMessage({ type: 'imagePath', path: filePath });
			console.log(`[Extension] Image selected: ${filePath}`);
		}
	}

	private sendPlatformInfo() {
		this.postMessage({ type: 'platformInfo', data: getPlatformInfo() });
	}

	private getMCPConfigPath(): string | undefined {
		return this.mcpHandler.getConfigPath();
	}

	/**
	 * Send active conversations list to webview
	 */
	private sendActiveConversations() {
		this.conversationHandler.sendActiveConversations();
	}

	/**
	 * Switch to a different conversation
	 */
	private async switchConversation(conversationId: string) {
		await this.conversationHandler.switchConversation(conversationId);
		// Resend any pending permission requests so they appear in the UI
		this.permissionRequestHandler.resendPendingPermissions();
	}

	/**
	 * Close a conversation
	 */
	private async closeConversation(conversationId: string) {
		await this.conversationHandler.closeConversation(conversationId, () => this.newSession());
	}

	/**
	 * Open conversation in a new panel
	 */
	private async openConversationInNewPanel(filename: string) {
		// Find an available provider (check if any provider has empty/no active conversation)
		// For now, we'll use a simple approach: open in column 2 if available, else column 3
		// This requires access to the global providers array which we'll need to pass in

		// As a workaround, we'll execute the command to open a new chat panel
		// and then load the conversation into it
		try {
			await vscode.commands.executeCommand('claude-code-chat.openChat2');

			// Give the panel time to initialize
			await new Promise(resolve => setTimeout(resolve, 100));

			// Load the conversation in the new panel
			await vscode.commands.executeCommand('claude-code-chat.loadConversation', filename);
		} catch (error) {
			console.error('Failed to open conversation in new panel:', error);
			vscode.window.showErrorMessage('Failed to open conversation in new panel');
		}
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
