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

	// State
	private currentProcess: cp.ChildProcess | undefined;
	private isProcessing = false;
	private selectedModel = 'default';
	private pendingPermissions = new Map<string, any>();
	private chatNumber: number;

	// Conversation state
	private currentConversationId: string | undefined;

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
			case 'selectImageFile':
				return this.selectImageFile();
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
			onOpenConversationInNewPanel: (filename: string) => this.openConversationInNewPanel(filename)
		};
	}

	/**
	 * Create stream parser callbacks
	 */
	private createStreamCallbacks() {
		return {
			onSessionStart: (sessionId: string) => {
				this.conversationManager.setSessionId(sessionId, this.currentConversationId);
			},
			onToolUse: (data: any) => {
				this.sendAndSaveMessage({ type: 'toolUse', data }, this.currentConversationId);
			},
			onToolResult: (data: any) => {
				this.sendAndSaveMessage({ type: 'toolResult', data }, this.currentConversationId);
			},
			onTextDelta: (text: string) => {
				this.postMessage({ type: 'textDelta', data: text });
			},
			onMessage: (content: string) => {
				this.sendAndSaveMessage({ type: 'assistantMessage', data: content }, this.currentConversationId);
			},
			onTokenUsage: (inputTokens: number, outputTokens: number) => {
				this.conversationManager.updateUsage(0, inputTokens, outputTokens, this.currentConversationId);

				// Send updated usage to UI
				const session = this.conversationManager.getCurrentSession();
				this.postMessage({
					type: 'usage',
					data: {
						inputTokens: session.totalTokensInput,
						outputTokens: session.totalTokensOutput,
						totalCost: session.totalCost
					}
				});
			},
			onCostUpdate: (cost: number) => {
				this.conversationManager.updateUsage(cost, 0, 0, this.currentConversationId);

				// Send updated cost to UI
				const session = this.conversationManager.getCurrentSession();
				this.postMessage({
					type: 'usage',
					data: {
						inputTokens: session.totalTokensInput,
						outputTokens: session.totalTokensOutput,
						totalCost: session.totalCost
					}
				});
			},
			onResult: async (data: any) => {
				this.postMessage({ type: 'result', data });
				this.postMessage({ type: 'setProcessing', data: { isProcessing: false } });
				this.postMessage({ type: 'clearLoading' });
				this.isProcessing = false;

				// Extract and send usage info from result
				// Usage can be at top level or in nested usage object
				const usage = data.usage || {};
				const inputTokens = data.input_tokens || usage.input_tokens || 0;
				const outputTokens = data.output_tokens || usage.output_tokens || 0;
				const cacheReadTokens = usage.cache_read_input_tokens || 0;
				const cost = data.total_cost_usd || 0;

				console.log('[Extension] Result usage data:', { inputTokens, outputTokens, cacheReadTokens, cost });

				if (inputTokens || outputTokens || cost) {
					// Update conversation manager
					this.conversationManager.updateUsage(cost, inputTokens, outputTokens, this.currentConversationId);

					// Send to UI
					const session = this.conversationManager.getCurrentSession();
					console.log('[Extension] Sending usage to UI:', session);
					this.postMessage({
						type: 'usage',
						data: {
							inputTokens: session.totalTokensInput,
							outputTokens: session.totalTokensOutput,
							totalCost: session.totalCost
						}
					});
				}

				// Auto-save conversation after each response
				await this.conversationManager.saveConversation(this.currentConversationId);

				// Refresh conversation list to update timestamps
				const conversations = this.conversationManager.getConversationList();
				this.postMessage({ type: 'conversationList', data: conversations });
			},
			onError: (error: string) => {
				this.sendAndSaveMessage({ type: 'error', data: error }, this.currentConversationId);
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
	private async sendMessageToClaude(message: string, _planMode?: boolean, thinkingMode?: boolean) {
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
		// --print is required for non-interactive mode to properly execute tools
		const args = [
			'--print',
			'--output-format', 'stream-json',
			'--input-format', 'stream-json',
			'--verbose'
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

		// Add session resume
		const session = this.conversationManager.getCurrentSession();
		if (session.sessionId) {
			args.push('--resume', session.sessionId);
		}

		console.log('[Extension] ========== FINAL ARGS CHECK ==========');
		console.log('[Extension] Complete args array:', JSON.stringify(args, null, 2));
		console.log('[Extension] Args includes permission-mode:', args.includes('--permission-mode'));
		console.log('[Extension] Permission mode value:', args[args.indexOf('--permission-mode') + 1]);

		this.isProcessing = true;

		// Show user input
		this.sendAndSaveMessage({ type: 'userInput', data: message });
		this.postMessage({ type: 'setProcessing', data: { isProcessing: true } });
		this.postMessage({ type: 'loading', data: 'Claude is working...' });

		try {
			// Spawn process with conversation ID
			const process = await this.processManager.spawn({
				args,
				cwd,
				wslEnabled: config.get('wsl.enabled', false),
				wslDistro: config.get('wsl.distro', 'Ubuntu'),
				nodePath: config.get('wsl.nodePath', '/usr/bin/node'),
				claudePath: config.get('wsl.claudePath', '/usr/local/bin/claude')
			}, this.currentConversationId);

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
				const dataStr = data.toString();
				console.log('[Extension] Claude stdout received:', dataStr.length, 'bytes');
				console.log('[Extension] Claude stdout content:', dataStr.substring(0, 200));

				// Log each complete line
				const lines = dataStr.split('\n').filter((l: string) => l.trim());
				lines.forEach((line: string, idx: number) => {
					console.log(`[Extension] Line ${idx}:`, line.substring(0, 150));
				});

				this.streamParser.parseChunk(dataStr);
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

		console.log('[Extension] ⚠️ PERMISSION REQUEST RECEIVED ⚠️');
		console.log('[Extension] Control request RAW:', JSON.stringify(requestData, null, 2));
		console.log('[Extension] Control request:', { request_id, tool_name, input });

		// Handle AskUserQuestion specially - it's not a permission request
		if (tool_name === 'AskUserQuestion') {
			this.handleUserQuestion(request_id, input);
			return;
		}

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
				status: 'pending',
				suggestions: requestData.request?.suggestions || requestData.suggestions
			}
		});
	}

	/**
	 * Handle AskUserQuestion tool
	 */
	private handleUserQuestion(requestId: string, input: any) {
		// Store pending question
		this.pendingPermissions.set(requestId, { request_id: requestId, tool_name: 'AskUserQuestion', input });

		// Send to UI
		this.postMessage({
			type: 'userQuestion',
			data: {
				id: requestId,
				questions: input.questions || []
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
		const tool_use_id = request.request?.tool_use_id || request.tool_use_id;

		if (approved && alwaysAllow) {
			this.permissionManager.addAlwaysAllowPermission(tool_name, input);
		}

		this.sendPermissionResponse(id, approved, input, tool_use_id, alwaysAllow ? tool_name : undefined);
		this.pendingPermissions.delete(id);
	}

	/**
	 * Handle user question response from UI
	 */
	private handleUserQuestionResponse(id: string, answers: Record<string, string>) {
		const request = this.pendingPermissions.get(id);
		if (!request) return;

		// Send answer back to Claude
		const response = {
			type: 'control_response',
			request_id: id,
			response: { answers }
		};

		console.log('[Extension] Sending user question response:', response);
		const writeResult = this.processManager.write(JSON.stringify(response) + '\n');
		console.log('[Extension] Write result:', writeResult);

		this.pendingPermissions.delete(id);
	}

	/**
	 * Send permission response to Claude
	 */
	private sendPermissionResponse(requestId: string, approved: boolean, input?: any, toolUseId?: string, alwaysAllowTool?: string) {
		console.log('[Extension] ========== SENDING PERMISSION RESPONSE ==========');
		console.log('[Extension] Request ID:', requestId);
		console.log('[Extension] Approved:', approved);
		console.log('[Extension] Tool Use ID:', toolUseId);

		let response: any;
		if (approved) {
			response = {
				type: 'control_response',
				response: {
					subtype: 'success',
					request_id: requestId,
					response: {
						behavior: 'allow',
						updatedInput: input,
						toolUseID: toolUseId
					}
				}
			};
			// Add updatedPermissions if always allow was selected
			if (alwaysAllowTool) {
				// Format according to Claude SDK PermissionUpdate type
				response.response.response.updatedPermissions = [{
					type: 'addRules',
					rules: [{ toolName: alwaysAllowTool }],
					behavior: 'allow',
					destination: 'session'
				}];
			}
		} else {
			response = {
				type: 'control_response',
				response: {
					subtype: 'success',
					request_id: requestId,
					response: {
						behavior: 'deny',
						message: 'User denied permission',
						interrupt: true,
						toolUseID: toolUseId
					}
				}
			};
		}

		console.log('[Extension] Response object:', JSON.stringify(response, null, 2));
		const responseStr = JSON.stringify(response) + '\n';
		console.log('[Extension] Response string:', responseStr);
		console.log('[Extension] Response bytes:', Buffer.from(responseStr).length);

		// Check stdin state before write
		console.log('[Extension] Process running before write:', this.processManager.isRunning());

		const writeResult = this.processManager.write(responseStr);
		console.log('[Extension] Write result:', writeResult);

		// Verify the process is still running
		if (this.processManager.isRunning()) {
			console.log('[Extension] Process is still running after write ✓');
		} else {
			console.error('[Extension] Process died after write! ✗');
		}

		this.postMessage({ type: 'updatePermissionStatus', data: { id: requestId, status: approved ? 'approved' : 'denied' } });

		// Monitor for response
		console.log('[Extension] Waiting for Claude response...');
		let checkCount = 0;
		const checkInterval = setInterval(() => {
			checkCount++;
			console.log(`[Extension] Check ${checkCount}/5: isProcessing=${this.isProcessing}, processRunning=${this.processManager.isRunning()}`);
			if (checkCount >= 5) {
				clearInterval(checkInterval);
			}
		}, 2000);

		// Set a timeout to detect if Claude isn't responding
		setTimeout(() => {
			clearInterval(checkInterval);
			if (this.isProcessing && this.processManager.isRunning()) {
				console.warn('[Extension] Claude has not responded 10 seconds after permission approval');
				console.warn('[Extension] This might indicate the process is stuck');
			}
		}, 10000);
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

		// Prune old conversations (keep max 100)
		await this.conversationManager.pruneOldConversations(100);

		this.conversationManager.startConversation();

		// Update current conversation ID
		this.currentConversationId = this.conversationManager.getActiveConversationId();

		this.postMessage({ type: 'sessionCleared' });
		this.postMessage({ type: 'setProcessing', data: { isProcessing: false } });

		// Refresh conversation history
		const conversations = this.conversationManager.getConversationList();
		this.postMessage({ type: 'conversationList', data: conversations });
	}

	/**
	 * Load conversation
	 */
	async loadConversation(filename: string) {
		console.log('[Extension] loadConversation called with filename:', filename);

		// Stop any active process first
		if (this.isProcessing || this.processManager.isRunning()) {
			console.log('[Extension] Stopping active process before loading conversation');
			await this.stopProcess();
			this.postMessage({ type: 'setProcessing', data: { isProcessing: false } });
		}

		// Save current conversation before loading another
		await this.conversationManager.saveConversation();

		// Load the conversation
		const conversation = await this.conversationManager.loadConversation(filename);
		console.log('[Extension] Conversation loaded:', conversation ? 'success' : 'failed');

		if (conversation) {
			// Update current conversation ID
			this.currentConversationId = this.conversationManager.getActiveConversationId();

			console.log('[Extension] Sending conversationLoaded message with', conversation.messages?.length || 0, 'messages');
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

			// Refresh conversation history
			const conversations = this.conversationManager.getConversationList();
			this.postMessage({ type: 'conversationList', data: conversations });
		} else {
			console.error('[Extension] Failed to load conversation, conversation is null/undefined');
		}
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
		console.log('[Extension] Sending conversation list:', conversations.length, 'conversations');
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
		const mcpConfigPath = this.getMCPConfigPath();
		if (!mcpConfigPath) {
			this.postMessage({ type: 'mcpServersLoaded', servers: {} });
			return;
		}

		try {
			const fs = require('fs').promises;
			const data = await fs.readFile(mcpConfigPath, 'utf8');
			const config = JSON.parse(data);
			this.postMessage({ type: 'mcpServersLoaded', servers: config.mcpServers || {} });
		} catch (error: any) {
			console.error('Failed to load MCP servers:', error.message);
			this.postMessage({ type: 'mcpServersLoaded', servers: {} });
		}
	}

	private async saveMCPServer(name: string, config: any) {
		const mcpConfigPath = this.getMCPConfigPath();
		if (!mcpConfigPath) {
			return;
		}

		try {
			const fs = require('fs').promises;
			let mcpConfig: any = { mcpServers: {} };

			// Load existing config
			try {
				const data = await fs.readFile(mcpConfigPath, 'utf8');
				mcpConfig = JSON.parse(data);
				if (!mcpConfig.mcpServers) {
					mcpConfig.mcpServers = {};
				}
			} catch {
				// File doesn't exist yet
			}

			// Add/update server
			mcpConfig.mcpServers[name] = config;

			// Save config
			await fs.writeFile(mcpConfigPath, JSON.stringify(mcpConfig, null, 2));

			// Reload servers in UI
			this.loadMCPServers();
		} catch (error: any) {
			console.error('Failed to save MCP server:', error.message);
		}
	}

	private async deleteMCPServer(name: string) {
		const mcpConfigPath = this.getMCPConfigPath();
		if (!mcpConfigPath) {
			return;
		}

		try {
			const fs = require('fs').promises;
			const data = await fs.readFile(mcpConfigPath, 'utf8');
			const mcpConfig = JSON.parse(data);

			if (mcpConfig.mcpServers && mcpConfig.mcpServers[name]) {
				delete mcpConfig.mcpServers[name];
				await fs.writeFile(mcpConfigPath, JSON.stringify(mcpConfig, null, 2));
				this.loadMCPServers();
			}
		} catch (error: any) {
			console.error('Failed to delete MCP server:', error.message);
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
		const fs = require('fs');
		const os = require('os');

		// Extract base64 data (remove data:image/png;base64, prefix if present)
		const base64Match = imageData.match(/^data:image\/\w+;base64,(.+)$/);
		const base64String = base64Match ? base64Match[1] : imageData;

		// Determine file extension from MIME type
		const ext = imageType.replace('image/', '').replace('jpeg', 'jpg');
		const fileName = `image-${Date.now()}.${ext}`;

		// Create temp file
		const tempDir = os.tmpdir();
		const filePath = path.join(tempDir, fileName);

		// Write the file
		const buffer = Buffer.from(base64String, 'base64');
		fs.writeFileSync(filePath, buffer);

		// Send the path back to webview
		this.postMessage({
			type: 'imagePath',
			path: filePath
		});

		// Show feedback
		console.log(`[Extension] Created image file: ${filePath}`);
	}

	private async selectImageFile() {
		const result = await vscode.window.showOpenDialog({
			canSelectFiles: true,
			canSelectFolders: false,
			canSelectMany: false,
			filters: {
				'Images': ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'svg']
			},
			title: 'Select an image to attach'
		});

		if (result && result[0]) {
			const filePath = result[0].fsPath;

			// Send the file path back to webview - Claude CLI will read it directly
			this.postMessage({
				type: 'imagePath',
				path: filePath
			});

			console.log(`[Extension] Image selected: ${filePath}`);
		}
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

	/**
	 * Send active conversations list to webview
	 */
	private sendActiveConversations() {
		const conversationIds = this.conversationManager.getActiveConversationIds();
		const activeConversations = conversationIds.map(id => {
			const conversation = this.conversationManager.getConversation(id);
			if (!conversation) {
				return null;
			}

			// Generate title from first user message
			const userMessages = conversation.messages.filter((m: any) => m.messageType === 'userInput');
			const title = userMessages.length > 0
				? userMessages[0].data.substring(0, 30) + (userMessages[0].data.length > 30 ? '...' : '')
				: 'New Chat';

			return {
				id,
				title,
				isActive: id === this.currentConversationId,
				hasNewMessages: conversation.hasNewMessages,
				newMessageCount: conversation.messages.filter((m: any) =>
					m.messageType !== 'userInput' && conversation.hasNewMessages
				).length,
				isProcessing: this.isProcessing && id === this.currentConversationId
			};
		}).filter(c => c !== null);

		this.postMessage({
			type: 'activeConversationsList',
			data: activeConversations
		});
	}

	/**
	 * Switch to a different conversation
	 */
	private async switchConversation(conversationId: string) {
		// Don't switch if already active
		if (conversationId === this.currentConversationId) {
			return;
		}

		// Save current conversation
		await this.conversationManager.saveConversation(this.currentConversationId);

		// Switch conversation in manager
		const success = this.conversationManager.switchConversation(conversationId);
		if (!success) {
			console.error('Failed to switch to conversation:', conversationId);
			return;
		}

		// Update current conversation ID
		this.currentConversationId = conversationId;

		// Load conversation data and send to webview
		const conversation = this.conversationManager.getConversation(conversationId);
		if (!conversation) {
			console.error('Conversation not found after switch:', conversationId);
			return;
		}

		// Send conversation loaded message
		this.postMessage({
			type: 'conversationLoaded',
			data: {
				messages: conversation.messages,
				sessionId: conversation.sessionId,
				startTime: conversation.startTime,
				totalCost: conversation.totalCost,
				totalTokens: {
					input: conversation.totalTokensInput,
					output: conversation.totalTokensOutput
				}
			}
		});

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

		// Notify webview of switch
		this.postMessage({
			type: 'conversationSwitched',
			conversationId: conversationId
		});
	}

	/**
	 * Close a conversation
	 */
	private async closeConversation(conversationId: string) {
		// Save before closing
		await this.conversationManager.saveConversation(conversationId);

		// Terminate any process for this conversation
		if (this.processManager.isConversationRunning(conversationId)) {
			await this.processManager.terminateConversation(conversationId);
		}

		// If closing the active conversation, switch to another or create new
		if (conversationId === this.currentConversationId) {
			const otherConversations = this.conversationManager.getActiveConversationIds()
				.filter(id => id !== conversationId);

			if (otherConversations.length > 0) {
				await this.switchConversation(otherConversations[0]);
			} else {
				// Create a new conversation
				await this.newSession();
			}
		}

		// Remove from active conversations (implementation depends on how you want to manage this)
		// For now, we'll just notify the UI
		this.sendActiveConversations();
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
