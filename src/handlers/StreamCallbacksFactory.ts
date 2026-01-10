/**
 * StreamCallbacksFactory.ts - Stream Event Callback Factory
 *
 * Creates the callback functions used by StreamParser to handle parsed events.
 * Each callback handles a specific event type (tool_use, text_delta, result, etc.)
 * and routes data to the ConversationManager for persistence and to the webview for display.
 *
 * Architecture: Backend operates independently - always saves messages and sends to UI with conversationId.
 * The webview decides what to display based on which conversation is currently being viewed.
 *
 * IMPORTANT: Each callback now receives the conversationId from the StreamParser, which captures it
 * at the time the data is parsed. This ensures messages go to the correct conversation even if
 * the user has switched to a different conversation while the process is still running.
 */

import * as vscode from 'vscode';
import { ConversationManager } from '../managers';
import { StreamCallbacks } from './StreamParser';

export interface StreamCallbacksConfig {
	conversationManager: ConversationManager;
	context: vscode.ExtensionContext;
	postMessage: (message: any) => void;
	getCurrentConversationId: () => string | undefined;
	getProcessingConversationId: () => string | undefined;
	isProcessing: () => boolean;
	setProcessingState: (isProcessing: boolean, conversationId?: string) => void;
	getStreamingText: (conversationId: string) => string | undefined;
	setStreamingText: (conversationId: string, text: string) => void;
	deleteStreamingText: (conversationId: string) => void;
	onControlRequest: (request: any) => void;
}

export function createStreamCallbacks(config: StreamCallbacksConfig): StreamCallbacks {
	const {
		conversationManager,
		context,
		postMessage,
		getCurrentConversationId,
		getProcessingConversationId,
		isProcessing,
		setProcessingState,
		getStreamingText,
		setStreamingText,
		deleteStreamingText,
		onControlRequest
	} = config;

	// Helper to send conversation list with processing state
	// Show green dot if: conversation is processing OR is the current active conversation
	const sendConversationList = () => {
		const conversations = conversationManager.getConversationList();
		const conversationsWithState = conversations.map(conv => {
			const convId = conversationManager.getConversationIdForFilename(conv.filename);
			const isActiveConversation = convId === getCurrentConversationId();
			const isProcessingConversation = isProcessing() && convId === getProcessingConversationId();
			return {
				...conv,
				isProcessing: isActiveConversation || isProcessingConversation
			};
		});
		postMessage({ type: 'conversationList', data: conversationsWithState });
	};

	return {
		onSessionStart: (sessionId: string, conversationId?: string) => {
			// Use the conversationId from the parser, falling back to getProcessingConversationId for compatibility
			const convId = conversationId || getProcessingConversationId();
			conversationManager.setSessionId(sessionId, convId);
		},

		onToolUse: (data: any, conversationId?: string) => {
			// Use the conversationId from the parser - this is the correct conversation for this data
			const convId = conversationId || getProcessingConversationId();
			console.log('[StreamCallbacksFactory] onToolUse - convId:', convId);
			// Always save to conversation
			conversationManager.addMessage('toolUse', data, convId);
			// Always send to UI with conversationId - UI will filter
			postMessage({
				type: 'toolUse',
				data,
				conversationId: convId
			});
		},

		onToolResult: (data: any, conversationId?: string) => {
			const convId = conversationId || getProcessingConversationId();
			console.log('[StreamCallbacksFactory] onToolResult - convId:', convId);
			// Always save to conversation
			conversationManager.addMessage('toolResult', data, convId);
			// Always send to UI with conversationId - UI will filter
			postMessage({
				type: 'toolResult',
				data,
				conversationId: convId
			});
		},

		onTextDelta: (text: string, conversationId?: string) => {
			const convId = conversationId || getProcessingConversationId();
			console.log('[StreamCallbacksFactory] onTextDelta - convId:', convId);

			if (!convId) {
				console.log('[StreamCallbacksFactory] onTextDelta skipped - no conversationId');
				return;
			}

			// Accumulate streaming text for this conversation
			const currentText = getStreamingText(convId) || '';
			setStreamingText(convId, currentText + text);

			// Always send to UI with conversationId - UI will filter
			postMessage({
				type: 'textDelta',
				data: text,
				conversationId: convId
			});
		},

		onMessage: (content: string, conversationId?: string) => {
			const convId = conversationId || getProcessingConversationId();
			console.log('[StreamCallbacksFactory] onMessage - convId:', convId);

			if (!convId) {
				console.log('[StreamCallbacksFactory] onMessage skipped - no conversationId');
				return;
			}

			// Clear streaming text for this conversation - message is complete
			deleteStreamingText(convId);

			// Always save to conversation
			conversationManager.addMessage('assistantMessage', content, convId);
			// Always send to UI with conversationId - UI will filter
			postMessage({
				type: 'finalizeStreaming',
				data: content,
				conversationId: convId
			});
		},

		onTokenUsage: (inputTokens: number, outputTokens: number, conversationId?: string) => {
			const convId = conversationId || getProcessingConversationId();
			console.log('[StreamCallbacksFactory] onTokenUsage called:', { inputTokens, outputTokens, convId });

			if (!convId) {
				console.log('[StreamCallbacksFactory] onTokenUsage skipped - no conversationId');
				return;
			}

			conversationManager.updateUsage(0, inputTokens, outputTokens, convId);
			console.log('[StreamCallbacksFactory] onTokenUsage - updated conversation usage');

			const conversation = conversationManager.getConversation(convId);
			postMessage({
				type: 'usage',
				data: {
					inputTokens: conversation?.totalTokensInput || 0,
					outputTokens: conversation?.totalTokensOutput || 0,
					totalCost: conversation?.totalCost || 0
				},
				conversationId: convId
			});
		},

		onCostUpdate: (cost: number, conversationId?: string) => {
			const convId = conversationId || getProcessingConversationId();

			if (!convId) {
				return;
			}

			conversationManager.updateUsage(cost, 0, 0, convId);

			const conversation = conversationManager.getConversation(convId);
			postMessage({
				type: 'usage',
				data: {
					inputTokens: conversation?.totalTokensInput || 0,
					outputTokens: conversation?.totalTokensOutput || 0,
					totalCost: conversation?.totalCost || 0
				},
				conversationId: convId
			});
		},

		onResult: async (data: any, conversationId?: string) => {
			const convId = conversationId || getProcessingConversationId();
			console.log('[StreamCallbacksFactory] onResult - convId:', convId);

			// Debug: Log subtype and end-of-turn indicators
			console.log('[StreamCallbacksFactory] onResult subtype:', data.subtype, 'is_done:', data.is_done, 'stop_reason:', data.stop_reason, 'full data:', JSON.stringify(data).substring(0, 500));

			// Always send result to UI with conversationId - UI will filter
			postMessage({
				type: 'result',
				data,
				conversationId: convId
			});
			postMessage({
				type: 'clearLoading',
				conversationId: convId
			});

			// Extract and send usage info from result
			// Usage can be at top level or in nested usage object
			const usage = data.usage || {};
			const inputTokens = data.input_tokens || usage.input_tokens || 0;
			const outputTokens = data.output_tokens || usage.output_tokens || 0;
			const cacheReadTokens = usage.cache_read_input_tokens || 0;
			const cost = data.total_cost_usd || 0;

			console.log('[Extension] Result usage data: inputTokens=' + inputTokens + ' outputTokens=' + outputTokens + ' cost=' + cost + ' convId=' + convId);

			if ((inputTokens || outputTokens || cost) && convId) {
				// Update conversation manager for the processing conversation
				conversationManager.updateUsage(cost, inputTokens, outputTokens, convId);

				// Always send to UI with conversationId - UI will filter
				const conversation = conversationManager.getConversation(convId);
				console.log('[Extension] Sending usage to UI: convId=' + convId + ' conversationExists=' + !!conversation + ' totalTokensInput=' + conversation?.totalTokensInput + ' totalTokensOutput=' + conversation?.totalTokensOutput + ' totalCost=' + conversation?.totalCost);
				postMessage({
					type: 'usage',
					data: {
						inputTokens: conversation?.totalTokensInput || 0,
						outputTokens: conversation?.totalTokensOutput || 0,
						totalCost: conversation?.totalCost || 0
					},
					conversationId: convId
				});
			}

			// Auto-save the processing conversation after each response
			if (convId) {
				await conversationManager.saveConversation(convId);
			}

			// Refresh conversation list to update timestamps
			sendConversationList();

			// Set processing to false AFTER all usage handling is complete
			// This ensures onTokenUsage/onCostUpdate callbacks can still access processingConvId
			//
			// End-of-turn detection:
			// - is_done === true: explicit completion flag
			// - stop_reason: indicates why model stopped (e.g., "end_turn", "tool_use")
			// - stop_reason === "end_turn": model finished its response
			// - subtype === 'success' with cost/tokens: final result with billing info
			// - subtype starts with 'error': error cases should end processing
			//
			// Note: Intermediate tool results may have subtype 'success' but typically no cost info
			const hasBillingInfo = (inputTokens > 0 || outputTokens > 0 || cost > 0);
			const isEndOfTurn = data.is_done === true ||
				data.stop_reason === 'end_turn' ||
				(data.subtype === 'success' && hasBillingInfo) ||
				data.subtype?.startsWith('error');

			console.log('[StreamCallbacksFactory] isEndOfTurn check:', { isEndOfTurn, is_done: data.is_done, stop_reason: data.stop_reason, subtype: data.subtype, hasBillingInfo });

			if (isEndOfTurn) {
				postMessage({
					type: 'setProcessing',
					data: { isProcessing: false },
					conversationId: convId
				});
				setProcessingState(false);
			}
		},

		onError: (error: string, conversationId?: string) => {
			const convId = conversationId || getProcessingConversationId();
			console.log('[StreamCallbacksFactory] onError - convId:', convId);
			// Always save to conversation
			if (convId) {
				conversationManager.addMessage('error', error, convId);
			}
			// Always send to UI with conversationId - UI will filter
			postMessage({
				type: 'error',
				data: error,
				conversationId: convId
			});
		},

		onAccountInfo: (info: any) => {
			if (info.subscription_type) {
				context.globalState.update('claude.subscriptionType', info.subscription_type);
			}
		},

		onControlRequest: (request: any) => {
			onControlRequest(request);
		},

		onControlResponse: (response: any) => {
			// Handle control responses if needed
		}
	};
}
