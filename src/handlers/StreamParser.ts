/**
 * StreamParser.ts - Claude CLI Output Parser
 *
 * Parses the JSON stream output from Claude CLI (stdout).
 * Handles different message types: tool_use, text_delta, result, control_request, etc.
 * Triggers callbacks for each parsed event type, allowing the extension to react
 * to streaming responses, tool executions, and permission requests.
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
	onControlRequest?: (request: any) => void;
	onControlResponse?: (response: any) => void;
}

export class StreamParser {
	private buffer: string = '';
	private currentMessageContent: string = '';
	private currentStreamingMessageId: string | null = null;
	// Track tool IDs to tool names for mapping tool_result to toolName
	private toolIdToName: Map<string, string> = new Map();
	// Track if we've already sent a message for this turn (to avoid duplicates from result.result)
	private messageSentThisTurn: boolean = false;
	// Current conversation ID context for this parsing session
	private currentConversationId: string | undefined;

	constructor(private callbacks: StreamCallbacks) {}

	/**
	 * Set the conversation ID context for subsequent parseChunk calls
	 * This should be called before parsing data from a specific conversation's process
	 */
	public setConversationContext(conversationId: string | undefined): void {
		this.currentConversationId = conversationId;
	}

	/**
	 * Get the current conversation context
	 */
	public getConversationContext(): string | undefined {
		return this.currentConversationId;
	}

	/**
	 * Parse incoming chunk of data
	 */
	public parseChunk(chunk: string, conversationId?: string): void {
		// If conversationId is provided, use it; otherwise use the stored context
		if (conversationId !== undefined) {
			this.currentConversationId = conversationId;
		}
		console.log('[StreamParser] Received chunk:', chunk.length, 'bytes');
		this.buffer += chunk;
		const lines = this.buffer.split('\n');

		// Keep the last incomplete line in the buffer
		this.buffer = lines.pop() || '';
		console.log('[StreamParser] Processing', lines.length, 'complete lines, buffer has', this.buffer.length, 'bytes remaining');

		for (const line of lines) {
			if (line.trim()) {
				console.log('[StreamParser] Processing line:', line.substring(0, 100));
				this.processLine(line);
			}
		}
	}

	/**
	 * Process a single line of JSON
	 */
	private processLine(line: string): void {
		try {
			const jsonData = JSON.parse(line);
			this.processJsonData(jsonData);
		} catch (error) {
			console.error('Failed to parse JSON line:', line, error);
		}
	}

	/**
	 * Process parsed JSON data
	 * All callbacks receive the currentConversationId so they know which conversation this data belongs to
	 */
	private processJsonData(data: any): void {
		console.log('[StreamParser] Processing JSON data type:', data.type, 'for conversation:', this.currentConversationId);
		const convId = this.currentConversationId;

		// Handle control messages
		if (data.type === 'control_request') {
			console.log('[StreamParser] Control request received');
			this.callbacks.onControlRequest?.(data);
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
		if (data.session_id && !this.currentStreamingMessageId) {
			this.currentStreamingMessageId = data.session_id;
			this.callbacks.onSessionStart?.(data.session_id, convId);
		}

		// Handle different content types
		if (data.type === 'tool_use') {
			// Normalize tool_use data format to match expected UI structure
			const toolData = {
				toolName: data.name,
				toolInfo: data.name,
				rawInput: data.input,
				id: data.id
			};
			// Track tool ID to name mapping for tool_result
			if (data.id && data.name) {
				this.toolIdToName.set(data.id, data.name);
			}
			this.callbacks.onToolUse?.(toolData, convId);
		} else if (data.type === 'tool_result') {
			// Normalize tool_result data format to match expected UI structure
			const toolName = this.toolIdToName.get(data.tool_use_id) || 'Unknown';
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
				this.currentMessageContent += text;
				this.callbacks.onTextDelta?.(text, convId);
			}
		} else if (data.type === 'text_delta') {
			// Accumulate text deltas (direct format)
			const text = data.text || '';
			this.currentMessageContent += text;
			this.callbacks.onTextDelta?.(text, convId);
		} else if (data.type === 'assistant') {
			// Handle assistant message (contains full message with content array)
			// Text may come from streaming (text_delta events) or directly in content array
			// Process tool_use items and collect text content
			let assistantTextContent = '';
			if (data.message?.content) {
				for (const contentItem of data.message.content) {
					if (contentItem.type === 'tool_use') {
						// Before showing tool use, flush any accumulated text as a complete message
						// This ensures text before tool use is displayed properly
						if (this.currentMessageContent) {
							this.callbacks.onMessage?.(this.currentMessageContent, convId);
							this.currentMessageContent = '';
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
							this.toolIdToName.set(contentItem.id, contentItem.name);
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
			if (this.currentMessageContent) {
				this.callbacks.onMessage?.(this.currentMessageContent, convId);
				this.currentMessageContent = '';
				this.messageSentThisTurn = true;
			} else if (assistantTextContent) {
				// No streaming text was accumulated - use text from content array
				this.callbacks.onMessage?.(assistantTextContent, convId);
				this.messageSentThisTurn = true;
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
			if (this.currentMessageContent) {
				this.callbacks.onMessage?.(this.currentMessageContent, convId);
				this.currentMessageContent = '';
				this.messageSentThisTurn = true;
			}
		} else if (data.type === 'result') {
			// Final result with stats
			console.log('[StreamParser] Result data:', JSON.stringify(data));

			// If there's accumulated streaming text, flush it first
			if (this.currentMessageContent) {
				this.callbacks.onMessage?.(this.currentMessageContent, convId);
				this.currentMessageContent = '';
				this.messageSentThisTurn = true;
			}
			// If no message was sent this turn and result contains text,
			// this means the response wasn't streamed - display it now
			// (avoid duplicates if assistant message already sent the text)
			else if (!this.messageSentThisTurn && data.result && typeof data.result === 'string') {
				console.log('[StreamParser] Result contains non-streamed text, displaying');
				this.callbacks.onMessage?.(data.result, convId);
			}

			this.callbacks.onResult?.(data, convId);
			// Reset the flag for the next turn
			this.messageSentThisTurn = false;

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
			this.currentMessageContent = '';
			this.currentStreamingMessageId = null;
		} else if (data.type === 'error') {
			this.callbacks.onError?.(data.message || 'Unknown error', convId);
		}
	}

	/**
	 * Reset parser state
	 */
	public reset(): void {
		this.buffer = '';
		this.currentMessageContent = '';
		this.currentStreamingMessageId = null;
		this.toolIdToName.clear();
		this.messageSentThisTurn = false;
	}

	/**
	 * Get current message content
	 */
	public getCurrentMessage(): string {
		return this.currentMessageContent;
	}
}
