/**
 * message-handler.js - Extension Message Router
 *
 * Handles all incoming postMessage events from the VS Code extension.
 * Routes messages to appropriate handlers based on message type.
 * Key message types: textDelta, toolUse, toolResult, permissionRequest,
 * conversationLoaded, setProcessing, loading, error, etc.
 */

// Note: window.currentViewedConversationId is initialized in state.js

/**
 * Check if a message is for the currently viewed conversation.
 * Returns true if:
 * - Message has no conversationId property at all (legacy/global message)
 * - Message's conversationId matches current viewed conversation
 * Returns false if:
 * - Message has conversationId property (even if undefined) but doesn't match current view
 * - Message has a conversationId but we don't know which conversation we're viewing
 */
function isMessageForCurrentConversation(message) {
	// Check if conversationId property exists on the message
	const hasConversationIdProperty = 'conversationId' in message;

	// If the message doesn't have a conversationId property at all,
	// it's a legacy/global message - always display
	if (!hasConversationIdProperty) {
		console.log('[isMessageForCurrentConversation] No conversationId property - accepting legacy message');
		return true;
	}

	// From here, the message has the conversationId property (even if the value is undefined)

	// If we don't know which conversation we're viewing, reject messages that have
	// a conversationId property (even undefined) - this prevents spill-over
	if (!window.currentViewedConversationId) {
		console.log('[isMessageForCurrentConversation] No currentViewedConversationId - rejecting');
		return false;
	}

	// If message's conversationId is undefined/null, reject it -
	// we don't know which conversation it belongs to
	if (!message.conversationId) {
		console.log('[isMessageForCurrentConversation] Message has undefined conversationId - rejecting');
		return false;
	}

	// Only display messages for the currently viewed conversation
	const result = message.conversationId === window.currentViewedConversationId;
	if (!result) {
		console.log('[isMessageForCurrentConversation] ID mismatch:', message.conversationId, '!==', window.currentViewedConversationId);
	}
	return result;
}

window.addEventListener('message', event => {
	const message = event.data;

	switch (message.type) {
		case 'ready':
			addMessage(message.data, 'system');
			updateStatusWithTotals();
			break;

		case 'restoreInputText': {
			const inputField = document.getElementById('messageInput');
			if (inputField && message.data) {
				inputField.value = message.data;
				inputField.style.height = 'auto';
				inputField.style.height = Math.min(inputField.scrollHeight, 200) + 'px';
			}
			break;
		}

		case 'output':
			// Only display output for the currently viewed conversation
			if (!isMessageForCurrentConversation(message)) {
				break;
			}
			if (message.data.trim()) {
				let displayData = message.data;

				// Check if this is a usage limit message with Unix timestamp
				const usageLimitMatch = displayData.match(/Claude AI usage limit reached\|(\d+)/);
				if (usageLimitMatch) {
					const timestamp = parseInt(usageLimitMatch[1]);
					const date = new Date(timestamp * 1000);
					const readableDate = date.toLocaleString(
						undefined,
						{
							weekday: 'short',
							month: 'short',
							day: 'numeric',
							hour: 'numeric',
							minute: '2-digit',
							second: '2-digit',
							hour12: true,
							timeZoneName: 'short',
							year: 'numeric'
						}
					);
					displayData = displayData.replace(usageLimitMatch[0], `Claude AI usage limit reached: ${readableDate}`);
				}

				// Try to append to existing streaming message, or create new one
				const parsedContent = parseSimpleMarkdown(displayData);
				if (!appendToLastClaudeMessage(parsedContent)) {
					// Start new streaming message
					window.currentStreamingMessageId = Date.now().toString();
					addMessage(parsedContent, 'claude');
				}
			}
			updateStatusWithTotals();
			break;

		case 'assistantMessage':
			// Handle assistant message from Claude
			// Only display for the currently viewed conversation
			if (!isMessageForCurrentConversation(message)) {
				break;
			}
			window.currentStreamingMessageId = null;
			if (message.data && message.data.trim()) {
				addMessage(parseSimpleMarkdown(message.data), 'claude');
			}
			updateStatusWithTotals();
			break;

		case 'textDelta':
			// Handle streaming text delta - accumulate full text and re-render
			// Only process if this is for the currently viewed conversation
			// IMPORTANT: isMessageForCurrentConversation now rejects messages with undefined conversationId
			console.log('[textDelta] Checking:', message.conversationId, 'vs viewed:', window.currentViewedConversationId);
			if (message.data && isMessageForCurrentConversation(message)) {
				console.log('[textDelta] ACCEPTED');
				// Store the conversation ID this delta belongs to
				// At this point, message.conversationId is guaranteed to be defined and match currentViewedConversationId
				const deltaConversationId = message.conversationId;

				// Initialize streaming state if needed
				if (!window.streamingState) {
					window.streamingState = {
						fullText: '',
						timeout: null,
						messageId: null,
						conversationId: deltaConversationId
					};
					// Reset tool tracking when text content starts
					resetToolTracking();
				}

				// If streaming state is for a different conversation, ignore this delta
				// Note: We use strict comparison and require both to be truthy
				if (window.streamingState.conversationId &&
					deltaConversationId &&
					window.streamingState.conversationId !== deltaConversationId) {
					break;
				}

				// Extra safety: if the streaming state has no conversationId but we do, update it
				if (!window.streamingState.conversationId && deltaConversationId) {
					window.streamingState.conversationId = deltaConversationId;
				}

				// Accumulate the raw text
				window.streamingState.fullText += message.data;

				// Debounce the UI update (re-render every 50ms)
				if (!window.streamingState.timeout) {
					window.streamingState.timeout = setTimeout(() => {
						// Double-check we're still viewing the same conversation when timeout fires
						// Require BOTH to be truthy and matching
						const streamConvId = window.streamingState?.conversationId;
						const viewedConvId = window.currentViewedConversationId;
						if (window.streamingState && window.streamingState.fullText &&
							streamConvId && viewedConvId && streamConvId === viewedConvId) {
							const fullText = window.streamingState.fullText;
							window.streamingState.timeout = null;

							// Parse the FULL accumulated text (not just the delta)
							const parsedContent = parseSimpleMarkdown(fullText);

							// Replace the entire content of the streaming message
							if (!window.streamingState.messageId) {
								// Start new streaming message
								window.streamingState.messageId = Date.now().toString();
								window.currentStreamingMessageId = window.streamingState.messageId;
								addMessage(parsedContent, 'claude');
							} else {
								// Replace content in existing message
								// If replace fails (message not found), create a new one
								if (!replaceStreamingMessageContent(parsedContent)) {
									// Message with matching ID not found - create new one
									window.currentStreamingMessageId = window.streamingState.messageId;
									addMessage(parsedContent, 'claude');
								}
							}
						} else if (window.streamingState) {
							// Conversation changed or IDs don't match, just clear the timeout reference
							window.streamingState.timeout = null;
						}
					}, 50);
				}
			}
			break;

		case 'userInput':
			// Reset streaming for new user message
			window.currentStreamingMessageId = null;
			window.streamingState = null;
			resetToolTracking();
			if (message.data.trim()) {
				addMessage(parseSimpleMarkdown(message.data), 'user');
			}
			break;

		case 'streamingReplay':
			// Replay accumulated streaming text after visibility change
			// Only process if for current conversation
			if (isMessageForCurrentConversation(message) && message.data) {
				// Initialize streaming state with the full accumulated text
				window.streamingState = {
					fullText: message.data,
					timeout: null,
					messageId: Date.now().toString(),
					conversationId: message.conversationId
				};
				window.currentStreamingMessageId = window.streamingState.messageId;

				// Render the accumulated text
				const parsedContent = parseSimpleMarkdown(message.data);
				addMessage(parsedContent, 'claude');
			}
			break;

		case 'finalizeStreaming':
			// Finalize any pending streaming message with complete content
			// Only process if for current conversation
			if (isMessageForCurrentConversation(message) && window.streamingState) {
				if (window.streamingState.timeout) {
					clearTimeout(window.streamingState.timeout);
				}
				// Use the final content from the server (complete message)
				if (message.data) {
					const parsedContent = parseSimpleMarkdown(message.data);
					replaceStreamingMessageContent(parsedContent);
				}
				// Reset streaming state for next message
				window.streamingState = null;
			}
			break;

		case 'loading':
			// Only display loading message for the currently viewed conversation
			if (isMessageForCurrentConversation(message)) {
				addMessage(message.data, 'system');
				updateStatusWithTotals();
			}
			break;

		case 'setProcessing':
			// Only update processing state if for current conversation
			if (isMessageForCurrentConversation(message)) {
				isProcessing = message.data.isProcessing;
				if (isProcessing) {
					startRequestTimer(message.data.requestStartTime);
					showStopButton();
					disableButtons();
					showProcessingIndicator();
				} else {
					isExecutingTool = false; // Reset tool execution state
					stopRequestTimer();
					hideStopButton();
					enableButtons();
					hideProcessingIndicator();

					// Flush any remaining streaming state and do final render
					if (window.streamingState) {
						if (window.streamingState.timeout) {
							clearTimeout(window.streamingState.timeout);
						}
						// Do final render with complete text
						if (window.streamingState.fullText) {
							const parsedContent = parseSimpleMarkdown(window.streamingState.fullText);
							replaceStreamingMessageContent(parsedContent);
						}
						// Reset streaming state for next message
						window.streamingState = null;
					}
					// Clear streaming message ID so next message creates a fresh element
					window.currentStreamingMessageId = null;

					// Send next queued message if any exist
					if (messageQueue.length > 0) {
						const queued = messageQueue.shift(); // Remove and get first message

						// Send the queued message (don't show in UI - already shown when queued)
						vscode.postMessage({
							type: 'message',
							content: queued.content,
							planMode: queued.planMode,
							thinkingMode: queued.thinkingMode,
							skipUIDisplay: true // Tell extension not to add to UI again
						});
						// Increment request count for queued message
						requestCount = (requestCount || 0) + 1;
					}
				}
				updateStatusWithTotals();
			}
			break;

		case 'clearLoading':
			// Only clear loading if for current conversation
			if (isMessageForCurrentConversation(message)) {
				if (messagesDiv.children.length > 0) {
					const lastMessage = messagesDiv.children[messagesDiv.children.length - 1];
					if (lastMessage.classList.contains('system')) {
						lastMessage.remove();
					}
				}
				updateStatusWithTotals();
			}
			break;

		case 'error':
			// Only display error if for current conversation
			if (isMessageForCurrentConversation(message) && message.data.trim()) {
				if (message.data.includes('Claude Code is not installed')) {
					showInstallModal();
				} else {
					addMessage(message.data, 'error');
				}
				updateStatusWithTotals();
			}
			break;

		case 'toolUse':
			// Only display if for current conversation
			console.log('[toolUse] Checking:', message.conversationId, 'vs viewed:', window.currentViewedConversationId);
			if (isMessageForCurrentConversation(message)) {
				console.log('[toolUse] ACCEPTED');
				isExecutingTool = true;
				addToolUseMessage(message.data);
				updateStatusWithTotals();
			} else {
				console.log('[toolUse] REJECTED');
			}
			break;

		case 'toolResult':
			// Only display if for current conversation
			console.log('[toolResult] Checking:', message.conversationId, 'vs viewed:', window.currentViewedConversationId);
			if (isMessageForCurrentConversation(message)) {
				console.log('[toolResult] ACCEPTED');
				isExecutingTool = false;
				addToolResultMessage(message.data);
				updateStatusWithTotals();
			} else {
				console.log('[toolResult] REJECTED');
			}
			break;

		case 'thinking':
			// Only display thinking for the currently viewed conversation
			if (!isMessageForCurrentConversation(message)) {
				break;
			}
			if (message.data.trim()) {
				addMessage(parseSimpleMarkdown(message.data), 'thinking');
			}
			break;

		case 'sessionInfo': {
			const sessionId = message.data.sessionId;
			showSessionInfo(sessionId);
			totalTokensInput = message.data.totalTokensInput || 0;
			totalTokensOutput = message.data.totalTokensOutput || 0;
			totalCost = message.data.totalCost || 0;
			requestCount = message.data.requestCount || 0;
			subscriptionType = message.data.subscriptionType || null;
			updateStatusWithTotals();
			break;
		}

		case 'imagePath': {
			const currentText = messageInput.value;
			const pathIndicator = `@${message.path} `;
			messageInput.value = currentText + pathIndicator;
			messageInput.focus();
			adjustTextareaHeight();

			// Show feedback that image was attached
			const fileName = message.path.split('/').pop() || message.path;
			showImageAddedFeedback(fileName);
			break;
		}

		case 'restoreCommit':
			showRestoreContainer(message.data);
			break;

		case 'restoreSuccess':
			hideRestoreContainer(message.data.sha);
			addMessage('✅ ' + message.data.message, 'system');
			break;

		case 'restoreError':
			addMessage('❌ ' + message.data, 'error');
			break;

		case 'workspaceFiles':
			filteredFiles = message.data;
			selectedFileIndex = -1;
			renderFileList();
			break;

		case 'conversationList':
			displayConversationList(message.data);
			break;

		case 'clipboardText':
			handleClipboardText(message.data);
			break;

		case 'modelSelected':
			currentModel = message.model;
			selectModel(message.model, true);
			break;

		case 'terminalOpened':
			addMessage(message.data, 'system');
			break;

		case 'permissionRequest':
			addPermissionRequestMessage(message.data);
			break;

		case 'userQuestion':
			addUserQuestionMessage(message.data);
			break;

		case 'updatePermissionStatus':
			updatePermissionStatus(message.data.id, message.data.status);
			break;

		case 'expirePendingPermissions':
			expireAllPendingPermissions();
			break;

		case 'mcpServers':
			displayMCPServers(message.data);
			break;

		case 'mcpServerSaved':
			loadMCPServers();
			addMessage('✅ MCP server "' + message.data.name + '" saved successfully', 'system');
			break;

		case 'mcpServerDeleted':
			loadMCPServers();
			addMessage('✅ MCP server deleted successfully', 'system');
			break;

		case 'permissions':
			renderPermissions(message.data);
			break;

		case 'planModeChanged': {
			planModeEnabled = message.data.enabled;
			const planModeSwitch = document.getElementById('planModeSwitch');
			if (planModeSwitch) {
				planModeSwitch.classList.toggle('active', planModeEnabled);
			}
			break;
		}

		case 'thinkingModeChanged': {
			thinkingModeEnabled = message.data.enabled;
			const thinkingModeSwitch = document.getElementById('thinkingModeSwitch');
			if (thinkingModeSwitch) {
				thinkingModeSwitch.classList.toggle('active', thinkingModeEnabled);
			}
			break;
		}

		case 'usageUpdate':
			totalTokensInput = message.data.totalTokensInput || 0;
			totalTokensOutput = message.data.totalTokensOutput || 0;
			totalCost = message.data.totalCost || 0;
			requestCount = message.data.requestCount || 0;
			subscriptionType = message.data.subscriptionType || null;
			updateStatusWithTotals();
			break;

		case 'customSnippetsData':
			customSnippetsData = message.data || {};
			loadCustomSnippets(customSnippetsData);
			break;

		case 'customSnippetSaved':
			vscode.postMessage({ type: 'getCustomSnippets' });
			break;

		case 'customSnippetDeleted':
			vscode.postMessage({ type: 'getCustomSnippets' });
			break;

		case 'settingsData': {
			const thinkingIntensity = message.data['thinking.intensity'] || 'think';
			const intensityValues = ['think', 'think-hard', 'think-harder', 'ultrathink'];
			const sliderValue = intensityValues.indexOf(thinkingIntensity);

			const thinkingIntensitySlider = document.getElementById('thinkingIntensitySlider');
			if (thinkingIntensitySlider) {
				thinkingIntensitySlider.value = sliderValue >= 0 ? sliderValue : 0;
				updateThinkingIntensityDisplay(thinkingIntensitySlider.value);
			} else {
				updateThinkingModeToggleName(sliderValue >= 0 ? sliderValue : 0);
			}

			document.getElementById('wsl-enabled').checked = message.data['wsl.enabled'] || false;
			document.getElementById('wsl-distro').value = message.data['wsl.distro'] || 'Ubuntu';
			document.getElementById('wsl-node-path').value = message.data['wsl.nodePath'] || '/usr/bin/node';
			document.getElementById('wsl-claude-path').value = message.data['wsl.claudePath'] || '/usr/local/bin/claude';
			document.getElementById('yolo-mode').checked = message.data['permissions.yoloMode'] || false;

			updateYoloWarning();

			document.getElementById('wslOptions').style.display = message.data['wsl.enabled'] ? 'block' : 'none';
			break;
		}

		case 'platformInfo':
			if (message.data.isWindows && !message.data.wslAlertDismissed && !message.data.wslEnabled) {
				setTimeout(() => {
					showWSLAlert();
				}, 1000);
			}
			break;

		case 'permissionsData':
			renderPermissions(message.data);
			break;

		case 'sessionCleared': {
			// Update the currently viewed conversation ID
			if (message.conversationId) {
				window.currentViewedConversationId = message.conversationId;
				console.log('[sessionCleared] Set window.currentViewedConversationId:', window.currentViewedConversationId);
			}

			// Clear the messages display
			const messagesDiv = document.getElementById('messages');
			messagesDiv.innerHTML = '';

			// Reset state
			window.currentStreamingMessageId = null;
			window.streamingState = null; // Reset streaming state
			messageQueue.length = 0; // Clear any queued messages

			// Reset usage counters for new conversation
			totalTokensInput = 0;
			totalTokensOutput = 0;
			totalCost = 0;
			requestCount = 0;

			// Show ready message
			addMessage('New chat started. Ready for your message!', 'system');
			updateStatusWithTotals();
			break;
		}

		case 'conversationLoaded': {
			console.log('[conversationLoaded] Received conversationLoaded event');

			// Update the currently viewed conversation ID
			if (message.data && message.data.conversationId) {
				window.currentViewedConversationId = message.data.conversationId;
				console.log('[conversationLoaded] Set window.currentViewedConversationId:', window.currentViewedConversationId);
			}

			// Reset processing state when loading a non-streaming conversation
			// The extension will send setProcessing:true after this if the conversation IS processing
			if (!message.data.streamingText) {
				isProcessing = false;
				stopRequestTimer();
				hideStopButton();
				enableButtons();
				hideProcessingIndicator();
			}
			messageQueue.length = 0; // Clear any queued messages

			// Clear current messages
			const msgDiv = document.getElementById('messages');
			msgDiv.innerHTML = '';
			window.currentStreamingMessageId = null;
			window.streamingState = null; // Reset streaming state
			resetToolTracking(); // Reset tool tracking for fresh display

			console.log('[conversationLoaded] Loading conversation:', message.data);

			// Load conversation messages
			if (message.data && message.data.messages) {
				console.log('[conversationLoaded] Found', message.data.messages.length, 'messages');
				message.data.messages.forEach(msg => {
					console.log('[conversationLoaded] Processing message:', msg.messageType, msg.data);
					if (msg.messageType === 'userInput') {
						addMessage(parseSimpleMarkdown(msg.data), 'user');
					} else if (msg.messageType === 'output' || msg.messageType === 'assistantMessage') {
						addMessage(parseSimpleMarkdown(msg.data), 'claude');
					} else if (msg.messageType === 'error') {
						addMessage(msg.data, 'error');
					} else if (msg.messageType === 'system') {
						addMessage(msg.data, 'system');
					} else if (msg.messageType === 'toolUse') {
						addToolUseMessage(msg.data);
					} else if (msg.messageType === 'toolResult') {
						addToolResultMessage(msg.data);
					}
				});
			}

			// If there's streaming text included (for processing conversation), render it
			if (message.data && message.data.streamingText) {
				console.log('[conversationLoaded] Found streaming text, rendering:', message.data.streamingText.length, 'chars');
				window.streamingState = {
					fullText: message.data.streamingText,
					timeout: null,
					messageId: Date.now().toString(),
					conversationId: message.data.conversationId // Include conversationId to prevent cross-talk
				};
				window.currentStreamingMessageId = window.streamingState.messageId;
				const parsedContent = parseSimpleMarkdown(message.data.streamingText);
				addMessage(parsedContent, 'claude');
			}

			// Update usage stats from conversation data
			console.log('[conversationLoaded] Usage data:', {
				totalTokens: message.data.totalTokens,
				totalCost: message.data.totalCost,
				messageCount: message.data.messages?.length
			});
			if (message.data.totalTokens) {
				totalTokensInput = message.data.totalTokens.input || 0;
				totalTokensOutput = message.data.totalTokens.output || 0;
			} else {
				totalTokensInput = 0;
				totalTokensOutput = 0;
			}
			totalCost = message.data.totalCost || 0;
			// Calculate request count from user messages (each userInput = 1 request)
			if (message.data.messages) {
				requestCount = message.data.messages.filter(m => m.messageType === 'userInput').length;
			} else {
				requestCount = message.data.requestCount || 0;
			}
			console.log('[conversationLoaded] Updated usage:', { totalTokensInput, totalTokensOutput, totalCost, requestCount });
			updateStatusWithTotals();

			// Scroll to bottom
			const messagesContainer = document.getElementById('messages');
			if (messagesContainer) {
				messagesContainer.scrollTop = messagesContainer.scrollHeight;
			}

			console.log('[conversationLoaded] Conversation loaded successfully, closing history view');
			// Close history view (use explicit close, not toggle)
			closeConversationHistory();
			break;
		}

		case 'mcpServersLoaded':
			displayMCPServers(message.servers || {});
			break;

		case 'usage':
			console.log('[usage] Received message:', message, 'window.currentViewedConversationId:', window.currentViewedConversationId);
			// Only update usage if for current conversation
			if (isMessageForCurrentConversation(message) && message.data) {
				console.log('[usage] Processing usage data:', message.data);
				totalTokensInput = message.data.inputTokens || 0;
				totalTokensOutput = message.data.outputTokens || 0;
				totalCost = message.data.totalCost || 0;
				// Only set requestCount if explicitly provided (e.g., initial load or conversation switch)
				// Don't increment on streaming updates - requestCount is incremented when user sends a message
				if (message.data.requestCount !== undefined) {
					requestCount = message.data.requestCount;
				}
				console.log('[usage] Updated totals:', { totalTokensInput, totalTokensOutput, totalCost, requestCount });
				updateStatusWithTotals();
			} else {
				console.log('[usage] Skipped - not for current conversation or no data');
			}
			break;

		case 'activeConversationsList':
			// Handle active conversations list from extension
			handleActiveConversationsList(message.data);
			break;

		case 'conversationCreated':
			// Add new conversation tab
			addConversationTab(message.conversationId, message.title);
			break;

		case 'conversationSwitched':
			// Update current active conversation (for tabs UI)
			currentActiveConversationId = message.conversationId;
			// Also update the viewed conversation ID (for message filtering)
			window.currentViewedConversationId = message.conversationId;
			console.log('[conversationSwitched] Set window.currentViewedConversationId:', window.currentViewedConversationId);

			// Clear any pending streaming state from previous conversation
			if (window.streamingState && window.streamingState.conversationId !== message.conversationId) {
				if (window.streamingState.timeout) {
					clearTimeout(window.streamingState.timeout);
				}
				window.streamingState = null;
				window.currentStreamingMessageId = null;
			}

			// Add conversation to tabs if not present (e.g., when loading from history)
			if (!activeConversations.has(message.conversationId)) {
				activeConversations.set(message.conversationId, {
					id: message.conversationId,
					title: message.title || 'Chat',
					hasNewMessages: false,
					newMessageCount: 0,
					isProcessing: false
				});
			}
			renderConversationTabs();
			break;

		case 'conversationUpdated':
			// Update conversation metadata
			if (message.title) {
				updateConversationTitle(message.conversationId, message.title);
			}
			if (message.hasNewMessages !== undefined) {
				const conversation = activeConversations.get(message.conversationId);
				if (conversation) {
					conversation.hasNewMessages = message.hasNewMessages;
					conversation.newMessageCount = message.newMessageCount || 0;
					renderConversationTabs();
				}
			}
			if (message.isProcessing !== undefined) {
				setConversationProcessing(message.conversationId, message.isProcessing);
			}
			break;
	}
});
