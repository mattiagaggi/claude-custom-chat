// Window message event handler - handles all messages from VS Code extension

window.addEventListener('message', event => {
	const message = event.data;

	switch (message.type) {
		case 'ready':
			addMessage(message.data, 'system');
			updateStatusWithTotals();
			break;

		case 'restoreInputText':
			const inputField = document.getElementById('messageInput');
			if (inputField && message.data) {
				inputField.value = message.data;
				inputField.style.height = 'auto';
				inputField.style.height = Math.min(inputField.scrollHeight, 200) + 'px';
			}
			break;

		case 'output':
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
					currentStreamingMessageId = Date.now().toString();
					addMessage(parsedContent, 'claude');
				}
			}
			updateStatusWithTotals();
			break;

		case 'assistantMessage':
			// Handle assistant message from Claude
			currentStreamingMessageId = null;
			if (message.data && message.data.trim()) {
				addMessage(parseSimpleMarkdown(message.data), 'claude');
			}
			updateStatusWithTotals();
			break;

		case 'textDelta':
			// Handle streaming text delta
			if (message.data) {
				const parsedContent = parseSimpleMarkdown(message.data);
				if (!appendToLastClaudeMessage(parsedContent)) {
					// Start new streaming message
					currentStreamingMessageId = Date.now().toString();
					addMessage(parsedContent, 'claude');
				}
			}
			break;

		case 'userInput':
			// Reset streaming for new user message
			currentStreamingMessageId = null;
			if (message.data.trim()) {
				addMessage(parseSimpleMarkdown(message.data), 'user');
			}
			break;

		case 'loading':
			addMessage(message.data, 'system');
			updateStatusWithTotals();
			break;

		case 'setProcessing':
			isProcessing = message.data.isProcessing;
			if (isProcessing) {
				startRequestTimer(message.data.requestStartTime);
				showStopButton();
				disableButtons();
				showProcessingIndicator();
			} else {
				stopRequestTimer();
				hideStopButton();
				enableButtons();
				hideProcessingIndicator();

				// Send next queued message if any exist
				if (messageQueue.length > 0) {
					const queued = messageQueue.shift(); // Remove and get first message

					// Send the queued message
					vscode.postMessage({
						type: 'message',
						content: queued.content,
						planMode: queued.planMode,
						thinkingMode: queued.thinkingMode
					});
				}
			}
			updateStatusWithTotals();
			break;

		case 'clearLoading':
			const messages = messagesDiv.children;
			if (messages.length > 0) {
				const lastMessage = messages[messages.length - 1];
				if (lastMessage.classList.contains('system')) {
					lastMessage.remove();
				}
			}
			updateStatusWithTotals();
			break;

		case 'error':
			if (message.data.trim()) {
				if (message.data.includes('Claude Code is not installed')) {
					showInstallModal();
				} else {
					addMessage(message.data, 'error');
				}
			}
			updateStatusWithTotals();
			break;

		case 'toolUse':
			addToolUseMessage(message.data);
			updateStatusWithTotals();
			break;

		case 'toolResult':
			addToolResultMessage(message.data);
			updateStatusWithTotals();
			break;

		case 'thinking':
			if (message.data.trim()) {
				addMessage(parseSimpleMarkdown(message.data), 'thinking');
			}
			break;

		case 'sessionInfo':
			const sessionId = message.data.sessionId;
			showSessionInfo(sessionId);
			totalTokensInput = message.data.totalTokensInput || 0;
			totalTokensOutput = message.data.totalTokensOutput || 0;
			totalCost = message.data.totalCost || 0;
			requestCount = message.data.requestCount || 0;
			subscriptionType = message.data.subscriptionType || null;
			updateStatusWithTotals();
			break;

		case 'imagePath':
			const currentText = messageInput.value;
			const pathIndicator = `@${message.path} `;
			messageInput.value = currentText + pathIndicator;
			messageInput.focus();
			adjustTextareaHeight();

			// Show feedback that image was attached
			const fileName = message.path.split('/').pop() || message.path;
			showImageAddedFeedback(fileName);
			break;

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

		case 'planModeChanged':
			planModeEnabled = message.data.enabled;
			const planModeSwitch = document.getElementById('planModeSwitch');
			if (planModeSwitch) {
				planModeSwitch.classList.toggle('active', planModeEnabled);
			}
			break;

		case 'thinkingModeChanged':
			thinkingModeEnabled = message.data.enabled;
			const thinkingModeSwitch = document.getElementById('thinkingModeSwitch');
			if (thinkingModeSwitch) {
				thinkingModeSwitch.classList.toggle('active', thinkingModeEnabled);
			}
			break;

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

		case 'settingsData':
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

		case 'sessionCleared':
			// Clear the messages display
			const messagesDiv = document.getElementById('messages');
			messagesDiv.innerHTML = '';

			// Reset state
			currentStreamingMessageId = null;
			messageQueue.length = 0; // Clear any queued messages

			// Show ready message
			addMessage('New chat started. Ready for your message!', 'system');
			updateStatusWithTotals();
			break;

		case 'conversationLoaded':
			console.log('[conversationLoaded] Received conversationLoaded event');

			// Clear processing state
			isProcessing = false;
			stopRequestTimer();
			hideStopButton();
			enableButtons();
			messageQueue.length = 0; // Clear any queued messages

			// Clear current messages
			const msgDiv = document.getElementById('messages');
			msgDiv.innerHTML = '';
			currentStreamingMessageId = null;

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

			// Update usage stats
			if (message.data.totalTokens) {
				totalTokensInput = message.data.totalTokens.input || 0;
				totalTokensOutput = message.data.totalTokens.output || 0;
				totalCost = message.data.totalCost || 0;
				requestCount = message.data.messageCount || 0;
			}
			updateStatusWithTotals();

			// Scroll to bottom
			const messagesContainer = document.getElementById('messages');
			if (messagesContainer) {
				messagesContainer.scrollTop = messagesContainer.scrollHeight;
			}

			console.log('[conversationLoaded] Conversation loaded successfully, closing history view');
			// Close history view
			toggleConversationHistory();
			break;

		case 'mcpServersLoaded':
			displayMCPServers(message.servers || {});
			break;

		case 'usage':
			if (message.data) {
				console.log('[usage] Received usage data:', message.data);
				totalTokensInput = message.data.inputTokens || 0;
				totalTokensOutput = message.data.outputTokens || 0;
				totalCost = message.data.totalCost || 0;
				requestCount = (requestCount || 0) + 1;
				console.log('[usage] Updated totals:', { totalTokensInput, totalTokensOutput, totalCost, requestCount });
				updateStatusWithTotals();
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
			// Update current active conversation
			currentActiveConversationId = message.conversationId;
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
