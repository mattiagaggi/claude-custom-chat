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
		this.buffer += chunk;
		const lines = this.buffer.split('\n');

		// Keep the last incomplete line in the buffer
		this.buffer = lines.pop() || '';

		for (const line of lines) {
			if (line.trim()) {
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
		// Handle control messages
		if (data.type === 'control_request') {
			this.callbacks.onControlRequest?.(data);
			return;
		}

		if (data.type === 'control_response') {
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
		} else if (data.type === 'message') {
			// Full message received
			if (this.currentMessageContent) {
				this.callbacks.onMessage?.(this.currentMessageContent);
				this.currentMessageContent = '';
			}
		} else if (data.type === 'result') {
			// Final result with stats
			this.callbacks.onResult?.(data);

			// Extract usage info
			if (data.input_tokens && data.output_tokens) {
				this.callbacks.onTokenUsage?.(
					data.input_tokens,
					data.output_tokens
				);
			}

			if (data.total_cost_usd) {
				this.callbacks.onCostUpdate?.(data.total_cost_usd);
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
