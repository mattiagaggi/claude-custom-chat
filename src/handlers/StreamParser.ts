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
			this.callbacks.onToolUse?.(data);
		} else if (data.type === 'tool_result') {
			this.callbacks.onToolResult?.(data);
		} else if (data.type === 'text_delta') {
			// Accumulate text deltas
			const text = data.text || '';
			this.currentMessageContent += text;
			this.callbacks.onTextDelta?.(text);
		} else if (data.type === 'assistant') {
			// Handle assistant message (contains full message with content array)
			if (data.message?.content) {
				// Process all content items
				for (const contentItem of data.message.content) {
					if (contentItem.type === 'text' && contentItem.text) {
						this.callbacks.onMessage?.(contentItem.text);
					} else if (contentItem.type === 'tool_use') {
						// Format tool use for display
						const toolData = {
							toolName: contentItem.name,
							toolInfo: contentItem.name,
							rawInput: contentItem.input,
							id: contentItem.id
						};
						this.callbacks.onToolUse?.(toolData);
					}
				}
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
			this.callbacks.onResult?.(data);

			// Note: Don't display result.result text here - it's already shown via the assistant message
			// The result message is just for stats (tokens, cost, etc.)

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
	}

	/**
	 * Get current message content
	 */
	public getCurrentMessage(): string {
		return this.currentMessageContent;
	}
}
