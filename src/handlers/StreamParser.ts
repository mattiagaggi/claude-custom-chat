/**
 * StreamParser - Parses Claude's stream-json output
 * Handles different message types and extracts data
 */

export interface StreamCallbacks {
	onSessionStart?: (sessionId: string) => void;
	onToolUse?: (data: any) => void;
	onToolResult?: (data: any) => void;
	onTextDelta?: (text: string) => void;
	onMessage?: (content: string) => void;
	onTokenUsage?: (inputTokens: number, outputTokens: number) => void;
	onCostUpdate?: (cost: number) => void;
	onResult?: (data: any) => void;
	onError?: (error: string) => void;
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

	constructor(private callbacks: StreamCallbacks) {}

	/**
	 * Parse incoming chunk of data
	 */
	public parseChunk(chunk: string): void {
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
	 */
	private processJsonData(data: any): void {
		console.log('[StreamParser] Processing JSON data type:', data.type);

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
			this.callbacks.onSessionStart?.(data.session_id);
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
			this.callbacks.onToolUse?.(toolData);
		} else if (data.type === 'tool_result') {
			// Normalize tool_result data format to match expected UI structure
			const toolName = this.toolIdToName.get(data.tool_use_id) || 'Unknown';
			const toolResultData = {
				toolName: toolName,
				content: data.content,
				isError: data.is_error || false,
				tool_use_id: data.tool_use_id
			};
			this.callbacks.onToolResult?.(toolResultData);
		} else if (data.type === 'stream_event') {
			// Handle streaming events from --include-partial-messages
			const event = data.event;
			if (event?.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
				const text = event.delta.text || '';
				this.currentMessageContent += text;
				this.callbacks.onTextDelta?.(text);
			}
		} else if (data.type === 'text_delta') {
			// Accumulate text deltas (direct format)
			const text = data.text || '';
			this.currentMessageContent += text;
			this.callbacks.onTextDelta?.(text);
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
							this.callbacks.onMessage?.(this.currentMessageContent);
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
						this.callbacks.onToolUse?.(toolData);
					} else if (contentItem.type === 'text' && contentItem.text) {
						// Collect text from content array (used when not streaming)
						assistantTextContent += contentItem.text;
					}
				}
			}

			// Flush accumulated streaming text OR extracted text from content array
			// Streaming text takes priority (if present, content array text is duplicate)
			if (this.currentMessageContent) {
				this.callbacks.onMessage?.(this.currentMessageContent);
				this.currentMessageContent = '';
			} else if (assistantTextContent) {
				// No streaming text was accumulated - use text from content array
				this.callbacks.onMessage?.(assistantTextContent);
			}

			// Extract usage from assistant message
			if (data.message?.usage) {
				const usage = data.message.usage;
				console.log('[StreamParser] Assistant message usage:', usage);
				if (usage.input_tokens || usage.output_tokens) {
					this.callbacks.onTokenUsage?.(
						usage.input_tokens || 0,
						usage.output_tokens || 0
					);
				}
			}
		} else if (data.type === 'message') {
			// Full message received
			if (this.currentMessageContent) {
				this.callbacks.onMessage?.(this.currentMessageContent);
				this.currentMessageContent = '';
			}
		} else if (data.type === 'result') {
			// Final result with stats
			console.log('[StreamParser] Result data:', JSON.stringify(data));

			// If there's accumulated streaming text, flush it first
			if (this.currentMessageContent) {
				this.callbacks.onMessage?.(this.currentMessageContent);
				this.currentMessageContent = '';
			}
			// If no streaming text was accumulated but result contains text,
			// this means the response wasn't streamed - display it now
			else if (data.result && typeof data.result === 'string') {
				console.log('[StreamParser] Result contains non-streamed text, displaying');
				this.callbacks.onMessage?.(data.result);
			}

			this.callbacks.onResult?.(data);

			// Extract usage info - can be at top level or in usage object
			const inputTokens = data.input_tokens || data.usage?.input_tokens || 0;
			const outputTokens = data.output_tokens || data.usage?.output_tokens || 0;
			if (inputTokens || outputTokens) {
				console.log('[StreamParser] Tokens found:', inputTokens, outputTokens);
				this.callbacks.onTokenUsage?.(inputTokens, outputTokens);
			} else {
				console.log('[StreamParser] No tokens in result data. Keys:', Object.keys(data));
			}

			if (data.total_cost_usd) {
				console.log('[StreamParser] Cost found:', data.total_cost_usd);
				this.callbacks.onCostUpdate?.(data.total_cost_usd);
			} else {
				console.log('[StreamParser] No cost in result data');
			}

			// Reset for next message
			this.currentMessageContent = '';
			this.currentStreamingMessageId = null;
		} else if (data.type === 'error') {
			this.callbacks.onError?.(data.message || 'Unknown error');
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
	}

	/**
	 * Get current message content
	 */
	public getCurrentMessage(): string {
		return this.currentMessageContent;
	}
}
