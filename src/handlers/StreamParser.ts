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

export interface StreamCallbacks {
	onSessionStart?: (sessionId: string, conversationId?: string) => void;
	onToolUse?: (data: any, conversationId?: string) => void;
	onToolResult?: (data: any, conversationId?: string) => void;
	onTextDelta?: (text: string, conversationId?: string) => void;
	onMessage?: (content: string, conversationId?: string) => void;
	onTokenUsage?: (inputTokens: number, outputTokens: number, conversationId?: string) => void;
	onCostUpdate?: (cost: number, conversationId?: string) => void;
	onResult?: (data: any, conversationId?: string) => void;
	onError?: (error: string, conversationId?: string) => void;
	onAccountInfo?: (info: any) => void;
	onControlRequest?: (request: any, conversationId?: string) => void;
	onControlResponse?: (response: any) => void;
}

/**
 * Per-conversation parser state
 */
interface ConversationParserState {
	buffer: string;
	currentMessageContent: string;
	currentStreamingMessageId: string | null;
	toolIdToName: Map<string, string>;
	messageSentThisTurn: boolean;
}

export class StreamParser {
	// Per-conversation state - isolates each conversation's parsing
	private conversationStates: Map<string, ConversationParserState> = new Map();

	// Fallback state for when no conversationId is provided (legacy behavior)
	private defaultState: ConversationParserState = this.createEmptyState();

	constructor(private callbacks: StreamCallbacks) {}

	/**
	 * Create empty parser state for a conversation
	 */
	private createEmptyState(): ConversationParserState {
		return {
			buffer: '',
			currentMessageContent: '',
			currentStreamingMessageId: null,
			toolIdToName: new Map(),
			messageSentThisTurn: false
		};
	}

	/**
	 * Get or create state for a conversation
	 */
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

	/**
	 * Parse incoming chunk of data for a specific conversation
	 */
	public parseChunk(chunk: string, conversationId?: string): void {
		const state = this.getState(conversationId);

		console.log('[StreamParser] Received chunk:', chunk.length, 'bytes', 'for conversation:', conversationId);
		state.buffer += chunk;
		const lines = state.buffer.split('\n');

		// Keep the last incomplete line in the buffer
		state.buffer = lines.pop() || '';
		console.log('[StreamParser] Processing', lines.length, 'complete lines, buffer has', state.buffer.length, 'bytes remaining');

		for (const line of lines) {
			if (line.trim()) {
				console.log('[StreamParser] Processing line:', line.substring(0, 100));
				this.processLine(line, conversationId, state);
			}
		}
	}

	/**
	 * Process a single line of JSON
	 */
	private processLine(line: string, conversationId: string | undefined, state: ConversationParserState): void {
		try {
			const jsonData = JSON.parse(line);
			this.processJsonData(jsonData, conversationId, state);
		} catch (error) {
			console.error('Failed to parse JSON line:', line, error);
		}
	}

	/**
	 * Process parsed JSON data
	 * All callbacks receive the conversationId so they know which conversation this data belongs to
	 */
	private processJsonData(data: any, convId: string | undefined, state: ConversationParserState): void {
		console.log('[StreamParser] Processing JSON data type:', data.type, 'for conversation:', convId);

		// Handle control messages
		if (data.type === 'control_request') {
			console.log('[StreamParser] Control request received for conversation:', convId);
			this.callbacks.onControlRequest?.(data, convId);
			return;
		}

		if (data.type === 'control_response') {
			console.log('[StreamParser] Control response received (echo from Claude)');
			this.callbacks.onControlResponse?.(data);
			return;
		}

		// Handle account info
		if (data.type === 'account_info') {
			this.callbacks.onAccountInfo?.(data);
			return;
		}

		// Handle session start
		if (data.session_id && !state.currentStreamingMessageId) {
			state.currentStreamingMessageId = data.session_id;
			this.callbacks.onSessionStart?.(data.session_id, convId);
		}

		// Handle different content types
		if (data.type === 'tool_use') {
			// Skip AskUserQuestion - it will be handled via control_request to show proper UI
			// Otherwise it shows duplicate: raw parameters AND the nice question form
			if (data.name === 'AskUserQuestion') {
				return;
			}
			// Normalize tool_use data format to match expected UI structure
			const toolData = {
				toolName: data.name,
				toolInfo: data.name,
				rawInput: data.input,
				id: data.id
			};
			// Track tool ID to name mapping for tool_result
			if (data.id && data.name) {
				state.toolIdToName.set(data.id, data.name);
			}
			this.callbacks.onToolUse?.(toolData, convId);
		} else if (data.type === 'tool_result') {
			// Normalize tool_result data format to match expected UI structure
			const toolName = state.toolIdToName.get(data.tool_use_id) || 'Unknown';
			const toolResultData = {
				toolName: toolName,
				content: data.content,
				isError: data.is_error || false,
				tool_use_id: data.tool_use_id
			};
			this.callbacks.onToolResult?.(toolResultData, convId);
		} else if (data.type === 'stream_event') {
			// Handle streaming events from --include-partial-messages
			const event = data.event;
			if (event?.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
				const text = event.delta.text || '';
				state.currentMessageContent += text;
				this.callbacks.onTextDelta?.(text, convId);
			}
		} else if (data.type === 'text_delta') {
			// Accumulate text deltas (direct format)
			const text = data.text || '';
			state.currentMessageContent += text;
			this.callbacks.onTextDelta?.(text, convId);
		} else if (data.type === 'assistant') {
			// Handle assistant message (contains full message with content array)
			// Text may come from streaming (text_delta events) or directly in content array
			// Process tool_use items and collect text content
			let assistantTextContent = '';
			if (data.message?.content) {
				for (const contentItem of data.message.content) {
					if (contentItem.type === 'tool_use') {
						// Skip AskUserQuestion - handled via control_request to show proper UI
						if (contentItem.name === 'AskUserQuestion') {
							continue;
						}
						// Before showing tool use, flush any accumulated text as a complete message
						// This ensures text before tool use is displayed properly
						if (state.currentMessageContent) {
							this.callbacks.onMessage?.(state.currentMessageContent, convId);
							state.currentMessageContent = '';
						}
						// Format tool use for display
						const toolData = {
							toolName: contentItem.name,
							toolInfo: contentItem.name,
							rawInput: contentItem.input,
							id: contentItem.id
						};
						// Track tool ID to name mapping for tool_result
						if (contentItem.id && contentItem.name) {
							state.toolIdToName.set(contentItem.id, contentItem.name);
						}
						this.callbacks.onToolUse?.(toolData, convId);
					} else if (contentItem.type === 'text' && contentItem.text) {
						// Collect text from content array (used when not streaming)
						assistantTextContent += contentItem.text;
					}
				}
			}

			// Flush accumulated streaming text OR extracted text from content array
			// Streaming text takes priority (if present, content array text is duplicate)
			if (state.currentMessageContent) {
				this.callbacks.onMessage?.(state.currentMessageContent, convId);
				state.currentMessageContent = '';
				state.messageSentThisTurn = true;
			} else if (assistantTextContent) {
				// No streaming text was accumulated - use text from content array
				this.callbacks.onMessage?.(assistantTextContent, convId);
				state.messageSentThisTurn = true;
			}

			// Extract usage from assistant message
			if (data.message?.usage) {
				const usage = data.message.usage;
				console.log('[StreamParser] Assistant message usage:', usage);
				if (usage.input_tokens || usage.output_tokens) {
					this.callbacks.onTokenUsage?.(
						usage.input_tokens || 0,
						usage.output_tokens || 0,
						convId
					);
				}
			}
		} else if (data.type === 'message') {
			// Full message received
			if (state.currentMessageContent) {
				this.callbacks.onMessage?.(state.currentMessageContent, convId);
				state.currentMessageContent = '';
				state.messageSentThisTurn = true;
			}
		} else if (data.type === 'result') {
			// Final result with stats
			console.log('[StreamParser] Result data:', JSON.stringify(data));

			// If there's accumulated streaming text, flush it first
			if (state.currentMessageContent) {
				this.callbacks.onMessage?.(state.currentMessageContent, convId);
				state.currentMessageContent = '';
				state.messageSentThisTurn = true;
			}
			// If no message was sent this turn and result contains text,
			// this means the response wasn't streamed - display it now
			// (avoid duplicates if assistant message already sent the text)
			else if (!state.messageSentThisTurn && data.result && typeof data.result === 'string') {
				console.log('[StreamParser] Result contains non-streamed text, displaying');
				this.callbacks.onMessage?.(data.result, convId);
			}

			this.callbacks.onResult?.(data, convId);
			// Reset the flag for the next turn
			state.messageSentThisTurn = false;

			// Extract usage info - can be at top level or in usage object
			// Also check for nested result.usage structure
			const usage = data.usage || data.result?.usage || {};
			const inputTokens = data.input_tokens || usage.input_tokens || 0;
			const outputTokens = data.output_tokens || usage.output_tokens || 0;
			console.log('[StreamParser] Result token extraction:', {
				'data.input_tokens': data.input_tokens,
				'data.output_tokens': data.output_tokens,
				'data.usage': data.usage,
				'data.result?.usage': data.result?.usage,
				'resolved': { inputTokens, outputTokens }
			});
			if (inputTokens || outputTokens) {
				console.log('[StreamParser] Tokens found:', inputTokens, outputTokens);
				this.callbacks.onTokenUsage?.(inputTokens, outputTokens, convId);
			} else {
				console.log('[StreamParser] No tokens in result data. Keys:', Object.keys(data));
			}

			if (data.total_cost_usd) {
				console.log('[StreamParser] Cost found:', data.total_cost_usd);
				this.callbacks.onCostUpdate?.(data.total_cost_usd, convId);
			} else {
				console.log('[StreamParser] No cost in result data');
			}

			// Reset for next message
			state.currentMessageContent = '';
			state.currentStreamingMessageId = null;
		} else if (data.type === 'error') {
			this.callbacks.onError?.(data.message || 'Unknown error', convId);
		}
	}

	/**
	 * Reset parser state for a specific conversation
	 */
	public resetConversation(conversationId: string): void {
		this.conversationStates.delete(conversationId);
	}

	/**
	 * Reset all parser state (legacy method for compatibility)
	 */
	public reset(): void {
		this.conversationStates.clear();
		this.defaultState = this.createEmptyState();
	}

	/**
	 * Get current message content for a conversation
	 */
	public getCurrentMessage(conversationId?: string): string {
		const state = this.getState(conversationId);
		return state.currentMessageContent;
	}

	/**
	 * Set the conversation ID context - kept for compatibility but no longer needed
	 * @deprecated Use parseChunk(chunk, conversationId) instead
	 */
	public setConversationContext(_conversationId: string | undefined): void {
		// No-op - kept for backwards compatibility
		// Conversation context is now passed directly to parseChunk
	}

	/**
	 * Get the current conversation context - kept for compatibility
	 * @deprecated Conversation context is now managed per-call
	 */
	public getConversationContext(): string | undefined {
		// Return undefined - context is no longer stored globally
		return undefined;
	}
}
