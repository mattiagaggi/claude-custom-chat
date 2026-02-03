/**
 * ClaudeMessageSender.ts - Claude CLI Message Sending
 *
 * Handles spawning Claude CLI processes and sending messages.
 * Consolidates the duplicated sendMessageToClaude/sendRegularMessage logic.
 */

import * as vscode from 'vscode';
import { ProcessManager } from '../managers/ProcessManager';
import { ConversationManager } from '../managers/ConversationManager';
import { MCPHandler } from './MCPHandler';
import { StreamParser } from './StreamParser';
import { ConversationHandler } from './ConversationHandler';
import { IdleDetectionManager } from './IdleDetectionManager';
import { fetchLogicGraphContext, buildContextFromCachedGraph } from './GraphBackendManager';

export interface MessageSenderDeps {
	processManager: ProcessManager;
	conversationManager: ConversationManager;
	mcpHandler: MCPHandler;
	streamParser: StreamParser;
	conversationHandler: ConversationHandler;
	idleDetectionManager: IdleDetectionManager;
	context: vscode.ExtensionContext;
	postMessage: (msg: any) => void;
	getCurrentConversationId: () => string | undefined;
	getProcessingConversationIds: () => Set<string>;
	getConversationStreamingText: () => Map<string, string>;
	getSelectedModel: () => string;
	stopConversationProcess: (convId: string) => Promise<void>;
	sendConversationList: () => void;
}

export class ClaudeMessageSender {
	constructor(private deps: MessageSenderDeps) {}

	async sendMessage(message: string, options?: { planMode?: boolean; thinkingMode?: boolean; skipUIDisplay?: boolean }) {
		const { thinkingMode, skipUIDisplay } = options || {};
		const processingIds = this.deps.getProcessingConversationIds();
		const currentConvId = this.deps.getCurrentConversationId();

		if (currentConvId && processingIds.has(currentConvId)) {
			await this.deps.stopConversationProcess(currentConvId);
			this.deps.postMessage({ type: 'assistantMessage', data: '⚠️ _Previous operation cancelled - starting new request..._' });
			this.deps.conversationManager.addMessage('assistantMessage', '⚠️ _Previous operation cancelled - starting new request..._', currentConvId);
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
		const mcpPath = this.deps.mcpHandler.getConfigPath();
		if (mcpPath) {
			// Only add MCP config if the file actually exists
			try {
				const fs = require('fs');
				if (fs.existsSync(mcpPath)) {
					args.push('--mcp-config', mcpPath);
				} else {
					console.log('[Extension] MCP config file does not exist, skipping:', mcpPath);
				}
			} catch {
				console.log('[Extension] Error checking MCP config, skipping');
			}
		}
		if (thinkingMode) {
			message = `${config.get<string>('thinking.intensity', 'think').toUpperCase().replace('-', ' ')} THROUGH THIS STEP BY STEP: \n${message}`;
		}

		// Resolve @logic-graph context injection
		if (message.includes('@logic-graph')) {
			let graphContext: string | null = null;
			// Try frontend cache first (always available if graph was generated)
			graphContext = buildContextFromCachedGraph(this.deps.context);
			// Fall back to backend if cache is empty
			if (!graphContext) {
				try {
					graphContext = await fetchLogicGraphContext(cwd);
				} catch {
					// Backend not reachable
				}
			}
			message = message.replace(/@logic-graph/g, graphContext
				? `\n<logic-graph>\n${graphContext}\n</logic-graph>\n`
				: '\n[Logic graph not available — generate it first via the Graph tab]\n');
		}

		const selectedModel = this.deps.getSelectedModel();
		if (selectedModel && selectedModel !== 'default') {
			args.push('--model', selectedModel);
		}

		const spawnedConversationId = currentConvId;
		if (!spawnedConversationId) { this.deps.postMessage({ type: 'error', data: 'No active conversation' }); return; }

		const conversation = this.deps.conversationManager.getConversation(spawnedConversationId);
		const sessionId = conversation?.sessionId;
		if (sessionId) {
			args.push('--resume', sessionId);
		}

		processingIds.add(spawnedConversationId);
		if (!skipUIDisplay) {
			this.deps.postMessage({ type: 'userInput', data: message });
			this.deps.conversationManager.addMessage('userInput', message, spawnedConversationId);
		} else {
			this.deps.conversationManager.addMessage('userInput', message, spawnedConversationId);
		}

		await this.deps.conversationManager.saveConversation(spawnedConversationId);
		this.deps.sendConversationList();
		this.deps.postMessage({ type: 'setProcessing', data: { isProcessing: true }, conversationId: spawnedConversationId });
		this.deps.postMessage({ type: 'loading', data: 'Claude is working...', conversationId: spawnedConversationId });
		this.deps.conversationHandler.sendActiveConversations();
		this.deps.idleDetectionManager.start();

		try {
			const proc = await this.deps.processManager.spawnForConversation({
				args, cwd,
				wslEnabled: config.get('wsl.enabled', false),
				wslDistro: config.get('wsl.distro', 'Ubuntu'),
				nodePath: config.get('wsl.nodePath', '/usr/bin/node'),
				claudePath: config.get('wsl.claudePath', '/usr/local/bin/claude')
			}, spawnedConversationId);

			console.log('[Extension] Process spawned:', {
				pid: proc.pid,
				killed: proc.killed,
				exitCode: proc.exitCode,
				hasStdout: !!proc.stdout,
				hasStderr: !!proc.stderr,
				hasStdin: !!proc.stdin,
				stdinWritable: proc.stdin?.writable,
				stdoutReadable: proc.stdout?.readable
			});

			// Attach event handlers BEFORE writing to avoid race conditions
			proc.stdout?.on('data', (d: Buffer) => {
				console.log('[Extension] stdout received:', d.toString().substring(0, 200));
				this.deps.streamParser.parseChunk(d.toString(), spawnedConversationId);
			});
			proc.stderr?.on('data', (d: Buffer) => { const e = d.toString(); console.log('[Extension] stderr received:', e); if (e.trim()) this.deps.postMessage({ type: 'error', data: `[CLI Error] ${e}`, conversationId: spawnedConversationId }); });
			proc.on('close', (code) => { console.log('[Extension] Process closed with code:', code); this.handleProcessEnd(spawnedConversationId); });
			proc.on('error', (e: Error) => { console.log('[Extension] Process error:', e); this.handleProcessError(spawnedConversationId, e); });
			proc.on('exit', (code, signal) => { console.log('[Extension] Process exit event:', code, signal); });
			proc.on('disconnect', () => { console.log('[Extension] Process disconnected'); });

			// Now write to the process
			const payload = JSON.stringify({
				type: 'user', session_id: sessionId || '',
				message: { role: 'user', content: [{ type: 'text', text: message }] },
				parent_tool_use_id: null
			}) + '\n';
			console.log('[Extension] Writing payload:', payload);
			this.deps.processManager.writeToConversation(spawnedConversationId, payload);

			// End stdin to signal we're done sending input for this message
			// This tells the CLI to process the input
			console.log('[Extension] Ending stdin...');
			proc.stdin?.end();
		} catch (e: any) {
			processingIds.delete(spawnedConversationId);
			this.deps.postMessage({ type: 'clearLoading', conversationId: spawnedConversationId });
			this.deps.postMessage({ type: 'setProcessing', data: { isProcessing: false }, conversationId: spawnedConversationId });
			this.deps.postMessage({ type: 'error', data: `Failed to start: ${e.message}`, conversationId: spawnedConversationId });
			this.deps.conversationHandler.sendActiveConversations();
		}
	}

	private handleProcessEnd(convId: string) {
		const processingIds = this.deps.getProcessingConversationIds();
		processingIds.delete(convId);
		if (processingIds.size === 0) {
			this.deps.idleDetectionManager.stop();
		}
		this.deps.postMessage({ type: 'clearLoading', conversationId: convId });
		this.deps.postMessage({ type: 'setProcessing', data: { isProcessing: false }, conversationId: convId });
		this.deps.conversationHandler.sendActiveConversations();
	}

	private handleProcessError(convId: string, error: Error) {
		this.handleProcessEnd(convId);
		if (error.message.includes('ENOENT')) {
			this.deps.postMessage({ type: 'showInstallModal' });
		} else {
			this.deps.postMessage({ type: 'error', data: `Error: ${error.message}`, conversationId: convId });
		}
	}
}
