/**
 * StreamParser.ts - Claude CLI Output Parser
 *
 * Parses the JSON stream output from Claude CLI (stdout).
 * Handles different message types: tool_use, text_delta, result, control_request, etc.
 * Triggers callbacks for each parsed event type, allowing the extension to react
 * to streaming responses, tool executions, and permission requests.
 *
 * IMPORTANT: Uses per-conversation state to support multiple concurrent processes.
 * Each conversation has its own buffer, message content, and tool mappings.
 */

// Tools that should not display in the tool UI (handled separately)
const HIDDEN_TOOLS = new Set(['AskUserQuestion']);

export interface StreamCallbacks {
	onSessionStart?: (sessionId: string, conversationId?: string) => void;
	onToolUse?: (data: ToolUseData, conversationId?: string) => void;
	onToolResult?: (data: ToolResultData, conversationId?: string) => void;
	onTextDelta?: (text: string, conversationId?: string) => void;
	onMessage?: (content: string, conversationId?: string) => void;
	onTokenUsage?: (inputTokens: number, outputTokens: number, conversationId?: string) => void;
	onCostUpdate?: (cost: number, conversationId?: string) => void;
	onResult?: (data: ResultData, conversationId?: string) => void;
	onError?: (error: string, conversationId?: string) => void;
	onAccountInfo?: (info: AccountInfo) => void;
	onControlRequest?: (request: ControlRequest, conversationId?: string) => void;
	onControlResponse?: (response: ControlResponse) => void;
}

export interface ToolUseData {
	toolName: string;
	toolInfo: string;
	rawInput: unknown;
	id: string;
}

export interface ToolResultData {
	toolName: string;
	content: string;
	isError: boolean;
	tool_use_id: string;
}

export interface ResultData {
	type: 'result';
	subtype?: string;
	is_error?: boolean;
	result?: string;
	usage?: UsageData;
	input_tokens?: number;
	output_tokens?: number;
	total_cost_usd?: number;
	stop_reason?: string;
	[key: string]: unknown;
}

interface UsageData {
	input_tokens?: number;
	output_tokens?: number;
	cache_read_input_tokens?: number;
	cache_creation_input_tokens?: number;
}

interface AccountInfo {
	subscription_type?: string;
	[key: string]: unknown;
}

interface ControlRequest {
	type: 'control_request';
	request_id: string;
	request?: {
		tool_name?: string;
		input?: unknown;
	};
	[key: string]: unknown;
}

interface ControlResponse {
	type: 'control_response';
	[key: string]: unknown;
}

interface StreamEventData {
	type: 'stream_event';
	event?: {
		type: string;
		delta?: {
			type: string;
			text?: string;
		};
	};
}

interface AssistantMessageData {
	type: 'assistant';
	message?: {
		content?: Array<{
			type: string;
			name?: string;
			id?: string;
			input?: unknown;
			text?: string;
		}>;
		usage?: UsageData;
	};
}

interface ConversationParserState {
	buffer: string;
	currentMessageContent: string;
	currentStreamingMessageId: string | null;
	toolIdToName: Map<string, string>;
	messageSentThisTurn: boolean;
}

export class StreamParser {
	private conversationStates = new Map<string, ConversationParserState>();
	private defaultState: ConversationParserState = this.createEmptyState();

	constructor(private callbacks: StreamCallbacks) {}

	// ============================================================
	// Public API
	// ============================================================

	/**
	 * Parse incoming chunk of data for a specific conversation
	 */
	public parseChunk(chunk: string, conversationId?: string): void {
		const state = this.getState(conversationId);

		console.log('[StreamParser] Received chunk:', chunk.length, 'bytes', 'for conversation:', conversationId);
		state.buffer += chunk;

		const lines = state.buffer.split('\n');
		state.buffer = lines.pop() || ''; // Keep incomplete line in buffer

		console.log('[StreamParser] Processing', lines.length, 'complete lines, buffer has', state.buffer.length, 'bytes remaining');

		for (const line of lines) {
			if (line.trim()) {
				this.processLine(line, conversationId, state);
			}
		}
	}

	/**
	 * Reset parser state for a specific conversation
	 */
	public resetConversation(conversationId: string): void {
		this.conversationStates.delete(conversationId);
	}

	/**
	 * Reset all parser state
	 */
	public reset(): void {
		this.conversationStates.clear();
		this.defaultState = this.createEmptyState();
	}

	/**
	 * Get current accumulated message content for a conversation
	 */
	public getCurrentMessage(conversationId?: string): string {
		return this.getState(conversationId).currentMessageContent;
	}

	/** @deprecated Use parseChunk(chunk, conversationId) instead */
	public setConversationContext(_conversationId: string | undefined): void {}

	/** @deprecated Conversation context is now managed per-call */
	public getConversationContext(): string | undefined {
		return undefined;
	}

	// ============================================================
	// State Management
	// ============================================================

	private createEmptyState(): ConversationParserState {
		return {
			buffer: '',
			currentMessageContent: '',
			currentStreamingMessageId: null,
			toolIdToName: new Map(),
			messageSentThisTurn: false
		};
	}

	private getState(conversationId?: string): ConversationParserState {
		if (!conversationId) {
			return this.defaultState;
		}

		let state = this.conversationStates.get(conversationId);
		if (!state) {
			state = this.createEmptyState();
			this.conversationStates.set(conversationId, state);
		}
		return state;
	}

	// ============================================================
	// Line Processing
	// ============================================================

	private processLine(line: string, conversationId: string | undefined, state: ConversationParserState): void {
		console.log('[StreamParser] Processing line:', line.substring(0, 100));
		try {
			const data = JSON.parse(line);
			this.routeMessage(data, conversationId, state);
		} catch (error) {
			console.error('Failed to parse JSON line:', line, error);
		}
	}

	private routeMessage(data: any, convId: string | undefined, state: ConversationParserState): void {
		console.log('[StreamParser] Processing JSON data type:', data.type, 'for conversation:', convId);

		// Handle session start (can be on any message with session_id)
		if (data.session_id && !state.currentStreamingMessageId) {
			state.currentStreamingMessageId = data.session_id;
			this.callbacks.onSessionStart?.(data.session_id, convId);
		}

		// Route based on message type
		switch (data.type) {
			case 'control_request':
				this.handleControlRequest(data, convId);
				break;
			case 'control_response':
				this.handleControlResponse(data);
				break;
			case 'account_info':
				this.callbacks.onAccountInfo?.(data);
				break;
			case 'tool_use':
				this.handleToolUse(data, convId, state);
				break;
			case 'tool_result':
				this.handleToolResult(data, convId, state);
				break;
			case 'stream_event':
				this.handleStreamEvent(data, convId, state);
				break;
			case 'text_delta':
				this.handleTextDelta(data, convId, state);
				break;
			case 'assistant':
				this.handleAssistantMessage(data, convId, state);
				break;
			case 'message':
				this.handleMessage(state, convId);
				break;
			case 'result':
				this.handleResult(data, convId, state);
				break;
			case 'error':
				this.callbacks.onError?.(data.message || 'Unknown error', convId);
				break;
		}
	}

	// ============================================================
	// Message Type Handlers
	// ============================================================

	private handleControlRequest(data: ControlRequest, convId: string | undefined): void {
		console.log('[StreamParser] Control request received for conversation:', convId);
		this.callbacks.onControlRequest?.(data, convId);
	}

	private handleControlResponse(data: ControlResponse): void {
		console.log('[StreamParser] Control response received (echo from Claude)');
		this.callbacks.onControlResponse?.(data);
	}

	private handleToolUse(data: { id?: string; name?: string; input?: unknown }, convId: string | undefined, state: ConversationParserState): void {
		// Always track tool ID to name mapping (needed for tool_result)
		if (data.id && data.name) {
			state.toolIdToName.set(data.id, data.name);
		}

		// Skip UI display for hidden tools (they have separate UI handling)
		if (data.name && HIDDEN_TOOLS.has(data.name)) {
			return;
		}

		this.callbacks.onToolUse?.({
			toolName: data.name || 'Unknown',
			toolInfo: data.name || 'Unknown',
			rawInput: data.input,
			id: data.id || ''
		}, convId);
	}

	private handleToolResult(data: { tool_use_id?: string; content?: string; is_error?: boolean }, convId: string | undefined, state: ConversationParserState): void {
		const toolName = state.toolIdToName.get(data.tool_use_id || '') || 'Unknown';
		this.callbacks.onToolResult?.({
			toolName,
			content: data.content || '',
			isError: data.is_error || false,
			tool_use_id: data.tool_use_id || ''
		}, convId);
	}

	private handleStreamEvent(data: StreamEventData, convId: string | undefined, state: ConversationParserState): void {
		const event = data.event;
		if (event?.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
			const text = event.delta.text || '';
			state.currentMessageContent += text;
			this.callbacks.onTextDelta?.(text, convId);
		}
	}

	private handleTextDelta(data: { text?: string }, convId: string | undefined, state: ConversationParserState): void {
		const text = data.text || '';
		state.currentMessageContent += text;
		this.callbacks.onTextDelta?.(text, convId);
	}

	private handleAssistantMessage(data: AssistantMessageData, convId: string | undefined, state: ConversationParserState): void {
		let assistantTextContent = '';

		// Process content array
		for (const item of data.message?.content || []) {
			if (item.type === 'tool_use') {
				this.processToolUseFromContent(item, convId, state);
			} else if (item.type === 'text' && item.text) {
				assistantTextContent += item.text;
			}
		}

		// Flush message content (streaming text takes priority over content array)
		this.flushMessageContent(state, convId, assistantTextContent);

		// Extract usage
		this.extractUsage(data.message?.usage, convId);
	}

	private handleMessage(state: ConversationParserState, convId: string | undefined): void {
		if (state.currentMessageContent) {
			this.callbacks.onMessage?.(state.currentMessageContent, convId);
			state.currentMessageContent = '';
			state.messageSentThisTurn = true;
		}
	}

	private handleResult(data: ResultData, convId: string | undefined, state: ConversationParserState): void {
		console.log('[StreamParser] Result data:', JSON.stringify(data));

		// Flush any accumulated text
		if (state.currentMessageContent) {
			this.callbacks.onMessage?.(state.currentMessageContent, convId);
			state.currentMessageContent = '';
			state.messageSentThisTurn = true;
		} else if (!state.messageSentThisTurn && data.result && typeof data.result === 'string') {
			// Display non-streamed result text
			console.log('[StreamParser] Result contains non-streamed text, displaying');
			this.callbacks.onMessage?.(data.result, convId);
		}

		this.callbacks.onResult?.(data, convId);
		state.messageSentThisTurn = false;

		// Extract and report usage
		this.extractResultUsage(data, convId);

		// Extract cost
		if (data.total_cost_usd) {
			console.log('[StreamParser] Cost found:', data.total_cost_usd);
			this.callbacks.onCostUpdate?.(data.total_cost_usd, convId);
		}

		// Reset state for next message
		state.currentMessageContent = '';
		state.currentStreamingMessageId = null;
	}

	// ============================================================
	// Helper Methods
	// ============================================================

	private processToolUseFromContent(
		item: { name?: string; id?: string; input?: unknown },
		convId: string | undefined,
		state: ConversationParserState
	): void {
		// Always track tool ID mapping
		if (item.id && item.name) {
			state.toolIdToName.set(item.id, item.name);
		}

		// Skip UI for hidden tools
		if (item.name && HIDDEN_TOOLS.has(item.name)) {
			return;
		}

		// Flush accumulated text before showing tool use
		if (state.currentMessageContent) {
			this.callbacks.onMessage?.(state.currentMessageContent, convId);
			state.currentMessageContent = '';
		}

		this.callbacks.onToolUse?.({
			toolName: item.name || 'Unknown',
			toolInfo: item.name || 'Unknown',
			rawInput: item.input,
			id: item.id || ''
		}, convId);
	}

	private flushMessageContent(state: ConversationParserState, convId: string | undefined, fallbackContent: string): void {
		if (state.currentMessageContent) {
			this.callbacks.onMessage?.(state.currentMessageContent, convId);
			state.currentMessageContent = '';
			state.messageSentThisTurn = true;
		} else if (fallbackContent) {
			this.callbacks.onMessage?.(fallbackContent, convId);
			state.messageSentThisTurn = true;
		}
	}

	private extractUsage(usage: UsageData | undefined, convId: string | undefined): void {
		if (!usage) {
			return;
		}

		console.log('[StreamParser] Assistant message usage:', usage);
		if (usage.input_tokens || usage.output_tokens) {
			this.callbacks.onTokenUsage?.(usage.input_tokens || 0, usage.output_tokens || 0, convId);
		}
	}

	private extractResultUsage(data: ResultData, convId: string | undefined): void {
		const usage = data.usage || (data.result as { usage?: UsageData } | undefined)?.usage || {};
		const inputTokens = data.input_tokens || usage.input_tokens || 0;
		const outputTokens = data.output_tokens || usage.output_tokens || 0;

		console.log('[StreamParser] Result token extraction:', {
			'data.input_tokens': data.input_tokens,
			'data.output_tokens': data.output_tokens,
			'data.usage': data.usage,
			resolved: { inputTokens, outputTokens }
		});

		if (inputTokens || outputTokens) {
			console.log('[StreamParser] Tokens found:', inputTokens, outputTokens);
			this.callbacks.onTokenUsage?.(inputTokens, outputTokens, convId);
		} else {
			console.log('[StreamParser] No tokens in result data. Keys:', Object.keys(data));
		}
	}
}
