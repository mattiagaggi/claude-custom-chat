/**
 * ConversationHandler.ts - Conversation Switching & Loading
 *
 * Manages switching between conversations, loading from history files,
 * and tracking which conversation is currently active vs processing.
 * Handles the logic for resuming processing conversations and sending
 * conversation state to the webview.
 */

import { ConversationManager, ProcessManager } from '../managers';

export interface ConversationHandlerConfig {
	conversationManager: ConversationManager;
	processManager: ProcessManager;
	postMessage: (message: any) => void;
	getCurrentConversationId: () => string | undefined;
	setCurrentConversationId: (id: string | undefined) => void;
	getProcessingConversationId: () => string | undefined;
	isProcessing: () => boolean;
	getStreamingText: (conversationId: string) => string | undefined;
	getProcessingConversationIds?: () => Set<string>;
}

export class ConversationHandler {
	private config: ConversationHandlerConfig;

	constructor(config: ConversationHandlerConfig) {
		this.config = config;
	}

	/**
	 * Send active conversations list to webview
	 */
	sendActiveConversations() {
		const { conversationManager, postMessage, getCurrentConversationId, getProcessingConversationIds } = this.config;

		// Get processing conversation IDs - use Set if available, otherwise empty set
		const processingIds = getProcessingConversationIds ? getProcessingConversationIds() : new Set<string>();

		const conversationIds = conversationManager.getActiveConversationIds();
		const activeConversations = conversationIds.map(id => {
			const conversation = conversationManager.getConversation(id);
			if (!conversation) {
				return null;
			}

			// Generate title from first user message
			const userMessages = conversation.messages.filter((m: any) => m.messageType === 'userInput');
			const title = userMessages.length > 0
				? userMessages[0].data.substring(0, 30) + (userMessages[0].data.length > 30 ? '...' : '')
				: 'New Chat';

			return {
				id,
				title,
				isActive: id === getCurrentConversationId(),
				hasNewMessages: conversation.hasNewMessages,
				newMessageCount: conversation.messages.filter((m: any) =>
					m.messageType !== 'userInput' && conversation.hasNewMessages
				).length,
				isProcessing: processingIds.has(id)
			};
		}).filter(c => c !== null);

		postMessage({
			type: 'activeConversationsList',
			data: activeConversations
		});
	}

	/**
	 * Send conversation list with processing state
	 */
	private sendConversationList() {
		const { conversationManager, postMessage, getCurrentConversationId, getProcessingConversationIds } = this.config;

		// Get processing conversation IDs - use Set if available, otherwise empty set
		const processingIds = getProcessingConversationIds ? getProcessingConversationIds() : new Set<string>();

		const conversations = conversationManager.getConversationList();
		// Show green dot if: conversation is processing OR is the current active conversation
		const conversationsWithState = conversations.map(conv => {
			const convId = conversationManager.getConversationIdForFilename(conv.filename);
			const isActiveConversation = convId === getCurrentConversationId();
			const isProcessingConversation = convId ? processingIds.has(convId) : false;
			return {
				...conv,
				isProcessing: isActiveConversation || isProcessingConversation
			};
		});
		postMessage({ type: 'conversationList', data: conversationsWithState });
	}

	/**
	 * Switch to a different conversation
	 */
	async switchConversation(conversationId: string) {
		const {
			conversationManager,
			postMessage,
			getCurrentConversationId,
			setCurrentConversationId,
			getProcessingConversationId,
			isProcessing,
			getStreamingText
		} = this.config;

		// Don't switch if already active
		if (conversationId === getCurrentConversationId()) {
			return;
		}

		// Save current conversation
		await conversationManager.saveConversation(getCurrentConversationId());

		// Switch conversation in manager
		const success = conversationManager.switchConversation(conversationId);
		if (!success) {
			console.error('Failed to switch to conversation:', conversationId);
			return;
		}

		// Update current conversation ID
		setCurrentConversationId(conversationId);

		// Load conversation data and send to webview
		const conversation = conversationManager.getConversation(conversationId);
		if (!conversation) {
			console.error('Conversation not found after switch:', conversationId);
			return;
		}

		// Check if this conversation is currently processing
		const isProcessingConv = conversationId === getProcessingConversationId() && isProcessing();
		const streamingText = isProcessingConv ? getStreamingText(conversationId) : null;

		// Send conversation loaded message (include streaming text if processing)
		console.log('[ConversationHandler] switchConversation sending tokens:', {
			totalTokensInput: conversation.totalTokensInput,
			totalTokensOutput: conversation.totalTokensOutput,
			totalCost: conversation.totalCost
		});
		postMessage({
			type: 'conversationLoaded',
			data: {
				conversationId: conversationId,
				messages: conversation.messages,
				sessionId: conversation.sessionId,
				startTime: conversation.startTime,
				totalCost: conversation.totalCost,
				totalTokens: {
					input: conversation.totalTokensInput,
					output: conversation.totalTokensOutput
				},
				currentContextUsed: conversation.currentContextUsed || 0,
				contextWindow: conversation.contextWindow || 200000,
				streamingText: streamingText || null
			}
		});

		// Update session info
		const session = conversationManager.getCurrentSession();
		postMessage({
			type: 'sessionInfo',
			data: {
				sessionId: session.sessionId,
				totalTokensInput: session.totalTokensInput,
				totalTokensOutput: session.totalTokensOutput,
				totalCost: session.totalCost,
				requestCount: session.messageCount
			}
		});

		// If this conversation is currently processing, set processing state
		if (isProcessingConv) {
			postMessage({
				type: 'setProcessing',
				data: { isProcessing: true, requestStartTime: Date.now() },
				conversationId: conversationId
			});
		}

		// Notify webview of switch (include title for tab display)
		const userMessage = conversation.messages.find(m => m.messageType === 'userInput');
		const title = (userMessage?.data as string)?.substring(0, 30) || 'Chat';
		postMessage({
			type: 'conversationSwitched',
			conversationId: conversationId,
			title: title
		});
	}

	/**
	 * Close a conversation
	 */
	async closeConversation(conversationId: string, newSessionCallback: () => Promise<void>) {
		const {
			conversationManager,
			processManager,
			getCurrentConversationId,
		} = this.config;

		// Save before closing
		await conversationManager.saveConversation(conversationId);

		// Terminate any process for this conversation
		if (processManager.isConversationRunning(conversationId)) {
			await processManager.terminateConversation(conversationId);
		}

		// If closing the active conversation, switch to another or create new
		if (conversationId === getCurrentConversationId()) {
			const otherConversations = conversationManager.getActiveConversationIds()
				.filter(id => id !== conversationId);

			if (otherConversations.length > 0) {
				// Switch first, then remove
				await this.switchConversation(otherConversations[0]);
				conversationManager.removeConversation(conversationId);
			} else {
				// Remove first, then create new
				conversationManager.removeConversation(conversationId);
				await newSessionCallback();
			}
		} else {
			// Not the active conversation, just remove it
			conversationManager.removeConversation(conversationId);
		}

		// Notify the UI
		this.sendActiveConversations();
	}

	/**
	 * Load a conversation by filename
	 */
	async loadConversation(
		filename: string,
		processingCheck: { isProcessing: boolean; processingConversationId: string | undefined }
	) {
		const {
			conversationManager,
			postMessage,
			setCurrentConversationId,
			getStreamingText
		} = this.config;

		console.log('[ConversationHandler] loadConversation called with filename:', filename);

		// Save current conversation before switching view
		await conversationManager.saveConversation();

		// Check if we're trying to load the currently processing conversation
		// In that case, use the in-memory state instead of loading from file
		if (processingCheck.isProcessing && processingCheck.processingConversationId) {
			const processingConv = conversationManager.getConversation(processingCheck.processingConversationId);
			if (processingConv && processingConv.filename === filename) {
				console.log('[ConversationHandler] Loading currently processing conversation from memory');

				// Switch to this conversation (don't load from file)
				conversationManager.switchConversation(processingCheck.processingConversationId);
				setCurrentConversationId(processingCheck.processingConversationId);

				// Get streaming text for this conversation (if any)
				const streamingText = getStreamingText(processingCheck.processingConversationId);

				// Send the in-memory conversation data to webview (including streaming text)
				postMessage({
					type: 'conversationLoaded',
					data: {
						conversationId: processingCheck.processingConversationId,
						messages: processingConv.messages,
						sessionId: processingConv.sessionId,
						startTime: processingConv.startTime,
						totalCost: processingConv.totalCost,
						totalTokens: {
							input: processingConv.totalTokensInput,
							output: processingConv.totalTokensOutput
						},
						currentContextUsed: processingConv.currentContextUsed || 0,
						contextWindow: processingConv.contextWindow || 200000,
						streamingText: streamingText || null
					}
				});
				postMessage({
					type: 'setProcessing',
					data: { isProcessing: true, requestStartTime: Date.now() },
					conversationId: processingCheck.processingConversationId
				});

				// Refresh conversation history and tabs
				this.sendConversationList();
				this.sendActiveConversations();
				return;
			}
		}

		// Load the conversation from file
		const conversation = await conversationManager.loadConversation(filename);
		console.log('[ConversationHandler] Conversation loaded:', conversation ? 'success' : 'failed');

		if (conversation) {
			// Update current conversation ID
			const activeId = conversationManager.getActiveConversationId();
			setCurrentConversationId(activeId);

			console.log('[ConversationHandler] Sending conversationLoaded message with', conversation.messages?.length || 0, 'messages');
			// Send conversation data to webview with conversationId included
			postMessage({
				type: 'conversationLoaded',
				data: {
					...conversation,
					conversationId: activeId
				}
			});

			// This is a non-processing conversation, so clear processing state in UI
			postMessage({ type: 'setProcessing', data: { isProcessing: false }, conversationId: activeId });

			// Update session info
			const session = conversationManager.getCurrentSession();
			postMessage({
				type: 'sessionInfo',
				data: {
					sessionId: session.sessionId,
					totalTokensInput: session.totalTokensInput,
					totalTokensOutput: session.totalTokensOutput,
					totalCost: session.totalCost,
					requestCount: session.messageCount
				}
			});

			// Refresh conversation history and tabs
			this.sendConversationList();
			this.sendActiveConversations();
		} else {
			console.error('[ConversationHandler] Failed to load conversation, conversation is null/undefined');
		}
	}
}
