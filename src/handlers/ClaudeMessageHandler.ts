/**
 * ClaudeMessageHandler.ts - Claude CLI Message Sending
 *
 * Handles sending messages to Claude CLI, managing process lifecycle,
 * and coordinating stdout/stderr/close events.
 */

import * as vscode from 'vscode';
import { ProcessManager, ConversationManager } from '../managers';
import { StreamParser } from './StreamParser';

export
	interface ClaudeMessageHandlerConfig {
	processManager: ProcessManager;
	conversationManager: ConversationManager;
	streamParser: StreamParser;
	postMessage: (message: any) => void;
	getCurrentConversationId: () => string | undefined;
	getProcessingConversationIds: () => Set<string>;
	addProcessingConversation: (id: string) => void;
	removeProcessingConversation: (id: string) => void;
	onProcessComplete: (conversationId: string) => void;
	onProcessError: (conversationId: string, error: Error) => void;
	getMCPConfigPath: () => string | undefined;
	getSelectedModel: () => string;
	startIdleDetection: () => void;
	stopIdleDetection: () => void;
}

export class ClaudeMessageHandler {
	private config: ClaudeMessageHandlerConfig;

	constructor(config: ClaudeMessageHandlerConfig) {
		this.config = config;
	}

	/**
	 * Send message to Claude CLI
	 * Supports concurrent processes - each conversation can have its own running process
	 */
	async sendMessage(
		message: string,
		thinkingMode?: boolean,
		skipUIDisplay?: boolean,
		onCancelPrevious?: () => Promise<void>
	): Promise<void> {
		const {
			processManager,
			conversationManager,
			streamParser,
			postMessage,
			getCurrentConversationId,
			getProcessingConversationIds,
			addProcessingConversation,
			removeProcessingConversation,
			onProcessComplete,
			onProcessError,
			getMCPConfigPath,
			getSelectedModel,
			startIdleDetection
		} = this.config;

		const currentConversationId = getCurrentConversationId();

		// Check if THIS conversation already has a running process
		if (currentConversationId && getProcessingConversationIds().has(currentConversationId)) {
			if (onCancelPrevious) {
				await onCancelPrevious();
			}
		}

		const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
		const cwd = workspaceFolder ? workspaceFolder.uri.fsPath : process.cwd();

		// Build args
		const args = this.buildArgs(message, thinkingMode, getMCPConfigPath(), getSelectedModel());

		// Get session ID for resume
		const conversation = currentConversationId
			? conversationManager.getConversation(currentConversationId)
			: null;
		const sessionId = conversation?.sessionId;
		if (sessionId) {
			args.push('--resume', sessionId);
		}

		console.log('[ClaudeMessageHandler] Args:', JSON.stringify(args, null, 2));
		console.log('[ClaudeMessageHandler] Conversation ID:', currentConversationId);

		// Capture the conversation ID at spawn time
		const spawnedConversationId = currentConversationId;

		if (!spawnedConversationId) {
			postMessage({ type: 'error', data: 'No active conversation' });
			return;
		}

		// Track this conversation as processing
		addProcessingConversation(spawnedConversationId);

		// Show user input
		if (!skipUIDisplay) {
			postMessage({ type: 'userInput', data: message });
			conversationManager.addMessage('userInput', message, spawnedConversationId);
		} else {
			conversationManager.addMessage('userInput', message, spawnedConversationId);
		}

		// Save conversation immediately
		await conversationManager.saveConversation(spawnedConversationId);

		postMessage({ type: 'setProcessing', data: { isProcessing: true }, conversationId: spawnedConversationId });
		postMessage({ type: 'loading', data: 'Claude is working...', conversationId: spawnedConversationId });

		startIdleDetection();

		const config = vscode.workspace.getConfiguration('claudeCodeChat');

		try {
			const process = await processManager.spawnForConversation({
				args,
				cwd,
				wslEnabled: config.get('wsl.enabled', false),
				wslDistro: config.get('wsl.distro', 'Ubuntu'),
				nodePath: config.get('wsl.nodePath', '/usr/bin/node'),
				claudePath: config.get('wsl.claudePath', '/usr/local/bin/claude')
			}, spawnedConversationId);

			// Write message to stdin
			const userMessage = {
				type: 'user',
				session_id: sessionId || '',
				message: {
					role: 'user',
					content: [{ type: 'text', text: message }]
				},
				parent_tool_use_id: null
			};
			processManager.writeToConversation(spawnedConversationId, JSON.stringify(userMessage) + '\n');

			// Handle stdout
			process.stdout?.on('data', (data) => {
				const dataStr = data.toString();
				console.log('[ClaudeMessageHandler] stdout:', dataStr.length, 'bytes');
				streamParser.parseChunk(dataStr, spawnedConversationId);
			});

			// Handle stderr
			process.stderr?.on('data', (data) => {
				const error = data.toString();
				console.error('[ClaudeMessageHandler] stderr:', error);
				if (error.trim()) {
					postMessage({ type: 'error', data: `[CLI Error] ${error}`, conversationId: spawnedConversationId });
				}
			});

			// Handle close
			process.on('close', (code) => {
				console.log('[ClaudeMessageHandler] Process closed with code:', code);
				removeProcessingConversation(spawnedConversationId);
				onProcessComplete(spawnedConversationId);
			});

			// Handle error
			process.on('error', (error) => {
				console.error('[ClaudeMessageHandler] Process error:', error);
				removeProcessingConversation(spawnedConversationId);
				onProcessError(spawnedConversationId, error);
			});

		} catch (error: any) {
			removeProcessingConversation(spawnedConversationId);
			postMessage({ type: 'clearLoading', conversationId: spawnedConversationId });
			postMessage({ type: 'setProcessing', data: { isProcessing: false }, conversationId: spawnedConversationId });
			postMessage({ type: 'error', data: `Failed to start: ${error.message}`, conversationId: spawnedConversationId });
		}
	}

	/**
	 * Build CLI arguments
	 */
	private buildArgs(
		message: string,
		thinkingMode?: boolean,
		mcpConfigPath?: string,
		selectedModel?: string
	): string[] {
		const args = [
			'--print',
			'--output-format', 'stream-json',
			'--input-format', 'stream-json',
			'--verbose',
			'--include-partial-messages'
		];

		const config = vscode.workspace.getConfiguration('claudeCodeChat');
		const yoloMode = config.get<boolean>('permissions.yoloMode', false);

		if (yoloMode) {
			args.push('--dangerously-skip-permissions');
		} else {
			args.push('--permission-prompt-tool', 'stdio');
		}

		if (mcpConfigPath) {
			args.push('--mcp-config', mcpConfigPath);
		}

		if (thinkingMode) {
			const intensity = config.get<string>('thinking.intensity', 'think');
			// Note: message modification happens in caller
		}

		if (selectedModel && selectedModel !== 'default') {
			args.push('--model', selectedModel);
		}

		return args;
	}
}
