/**
 * StreamCallbacksFactory - Creates stream parser callbacks
 *
 * Architecture: Backend operates independently - always saves messages and sends to UI with conversationId.
 * The webview decides what to display based on which conversation is currently being viewed.
 */

import * as vscode from 'vscode';
import { ConversationManager } from '../managers';
import { StreamCallbacks } from './StreamParser';

export interface StreamCallbacksConfig {
	conversationManager: ConversationManager;
	context: vscode.ExtensionContext;
	postMessage: (message: any) => void;
	getProcessingConversationId: () => string | undefined;
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
		getProcessingConversationId,
		setProcessingState,
		getStreamingText,
		setStreamingText,
		deleteStreamingText,
		onControlRequest
	} = config;

	return {
		onSessionStart: (sessionId: string) => {
			conversationManager.setSessionId(sessionId, getProcessingConversationId());
		},

		onToolUse: (data: any) => {
			const processingConvId = getProcessingConversationId();
			// Always save to conversation
			conversationManager.addMessage('toolUse', data, processingConvId);
			// Always send to UI with conversationId - UI will filter
			postMessage({
				type: 'toolUse',
				data,
				conversationId: processingConvId
			});
		},

		onToolResult: (data: any) => {
			const processingConvId = getProcessingConversationId();
			// Always save to conversation
			conversationManager.addMessage('toolResult', data, processingConvId);
			// Always send to UI with conversationId - UI will filter
			postMessage({
				type: 'toolResult',
				data,
				conversationId: processingConvId
			});
		},

		onTextDelta: (text: string) => {
			const processingConvId = getProcessingConversationId();
			// Accumulate streaming text for the processing conversation
			const convId = processingConvId || '';
			const currentText = getStreamingText(convId) || '';
			setStreamingText(convId, currentText + text);

			// Always send to UI with conversationId - UI will filter
			postMessage({
				type: 'textDelta',
				data: text,
				conversationId: processingConvId
			});
		},

		onMessage: (content: string) => {
			const processingConvId = getProcessingConversationId();
			// Clear streaming text for this conversation - message is complete
			const convId = processingConvId || '';
			deleteStreamingText(convId);

			// Always save to conversation
			conversationManager.addMessage('assistantMessage', content, processingConvId);
			// Always send to UI with conversationId - UI will filter
			postMessage({
				type: 'finalizeStreaming',
				data: content,
				conversationId: processingConvId
			});
		},

		onTokenUsage: (inputTokens: number, outputTokens: number) => {
			const processingConvId = getProcessingConversationId();
			conversationManager.updateUsage(0, inputTokens, outputTokens, processingConvId);

			// Always send usage to UI with conversationId - UI will filter
			const conversation = processingConvId
				? conversationManager.getConversation(processingConvId)
				: null;
			postMessage({
				type: 'usage',
				data: {
					inputTokens: conversation?.totalTokensInput || 0,
					outputTokens: conversation?.totalTokensOutput || 0,
					totalCost: conversation?.totalCost || 0
				},
				conversationId: processingConvId
			});
		},

		onCostUpdate: (cost: number) => {
			const processingConvId = getProcessingConversationId();
			conversationManager.updateUsage(cost, 0, 0, processingConvId);

			// Always send cost to UI with conversationId - UI will filter
			const conversation = processingConvId
				? conversationManager.getConversation(processingConvId)
				: null;
			postMessage({
				type: 'usage',
				data: {
					inputTokens: conversation?.totalTokensInput || 0,
					outputTokens: conversation?.totalTokensOutput || 0,
					totalCost: conversation?.totalCost || 0
				},
				conversationId: processingConvId
			});
		},

		onResult: async (data: any) => {
			const processingConvId = getProcessingConversationId();

			// Always send result to UI with conversationId - UI will filter
			postMessage({
				type: 'result',
				data,
				conversationId: processingConvId
			});
			postMessage({
				type: 'clearLoading',
				conversationId: processingConvId
			});

			// Extract and send usage info from result
			// Usage can be at top level or in nested usage object
			const usage = data.usage || {};
			const inputTokens = data.input_tokens || usage.input_tokens || 0;
			const outputTokens = data.output_tokens || usage.output_tokens || 0;
			const cacheReadTokens = usage.cache_read_input_tokens || 0;
			const cost = data.total_cost_usd || 0;

			console.log('[Extension] Result usage data: inputTokens=' + inputTokens + ' outputTokens=' + outputTokens + ' cost=' + cost + ' processingConvId=' + processingConvId);

			if (inputTokens || outputTokens || cost) {
				// Update conversation manager for the processing conversation
				conversationManager.updateUsage(cost, inputTokens, outputTokens, processingConvId);

				// Always send to UI with conversationId - UI will filter
				const conversation = processingConvId
					? conversationManager.getConversation(processingConvId)
					: null;
				console.log('[Extension] Sending usage to UI: processingConvId=' + processingConvId + ' conversationExists=' + !!conversation + ' totalTokensInput=' + conversation?.totalTokensInput + ' totalTokensOutput=' + conversation?.totalTokensOutput + ' totalCost=' + conversation?.totalCost);
				postMessage({
					type: 'usage',
					data: {
						inputTokens: conversation?.totalTokensInput || 0,
						outputTokens: conversation?.totalTokensOutput || 0,
						totalCost: conversation?.totalCost || 0
					},
					conversationId: processingConvId
				});
			}

			// Auto-save the processing conversation after each response
			await conversationManager.saveConversation(processingConvId);

			// Refresh conversation list to update timestamps
			const conversations = conversationManager.getConversationList();
			postMessage({ type: 'conversationList', data: conversations });

			// Set processing to false AFTER all usage handling is complete
			// This ensures onTokenUsage/onCostUpdate callbacks can still access processingConvId
			if (data.subtype === 'success' || data.subtype?.startsWith('error')) {
				postMessage({
					type: 'setProcessing',
					data: { isProcessing: false },
					conversationId: processingConvId
				});
				setProcessingState(false);
			}
		},

		onError: (error: string) => {
			const processingConvId = getProcessingConversationId();
			// Always save to conversation
			conversationManager.addMessage('error', error, processingConvId);
			// Always send to UI with conversationId - UI will filter
			postMessage({
				type: 'error',
				data: error,
				conversationId: processingConvId
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
