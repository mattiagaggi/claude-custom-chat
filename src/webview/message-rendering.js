// Message rendering functions

// Helper to append to the last Claude message (for streaming responses)
let currentStreamingMessageId = null;

function appendToLastClaudeMessage(content) {
	const messagesDiv = document.getElementById('messages');
	const messages = messagesDiv.querySelectorAll('.message.claude');
	const lastClaudeMessage = messages[messages.length - 1];

	if (lastClaudeMessage && lastClaudeMessage.dataset.streamingId === currentStreamingMessageId) {
		const contentDiv = lastClaudeMessage.querySelector('.message-content');
		if (contentDiv) {
			// Append the new content as HTML
			contentDiv.innerHTML += content;

			// Auto-scroll if needed
			if (shouldAutoScroll(messagesDiv)) {
				messagesDiv.scrollTop = messagesDiv.scrollHeight;
			}
			return true;
		}
	}
	return false;
}

function replaceStreamingMessageContent(content) {
	const messagesDiv = document.getElementById('messages');
	const messages = messagesDiv.querySelectorAll('.message.claude');
	const lastClaudeMessage = messages[messages.length - 1];

	if (lastClaudeMessage && lastClaudeMessage.dataset.streamingId === currentStreamingMessageId) {
		const contentDiv = lastClaudeMessage.querySelector('.message-content');
		if (contentDiv) {
			// Replace the entire content (for streaming re-render)
			contentDiv.innerHTML = content;

			// Auto-scroll if needed
			if (shouldAutoScroll(messagesDiv)) {
				messagesDiv.scrollTop = messagesDiv.scrollHeight;
			}
			return true;
		}
	}
	return false;
}

function addMessage(content, type = 'claude') {
	const messagesDiv = document.getElementById('messages');
	const shouldScroll = shouldAutoScroll(messagesDiv);

	const messageDiv = document.createElement('div');
	messageDiv.className = `message ${type}`;

	// Add header for main message types (excluding system)
	if (type === 'user' || type === 'claude' || type === 'error') {
		const headerDiv = document.createElement('div');
		headerDiv.className = 'message-header';

		const iconDiv = document.createElement('div');
		iconDiv.className = `message-icon ${type}`;

		const labelDiv = document.createElement('div');
		labelDiv.className = 'message-label';

		// Set icon and label based on type
		switch(type) {
			case 'user':
				iconDiv.textContent = '👤';
				labelDiv.textContent = 'You';
				break;
			case 'claude':
				iconDiv.textContent = '🤖';
				labelDiv.textContent = 'Claude';
				break;
			case 'error':
				iconDiv.textContent = '⚠️';
				labelDiv.textContent = 'Error';
				break;
		}

		// Add copy button
		const copyBtn = document.createElement('button');
		copyBtn.className = 'copy-btn';
		copyBtn.title = 'Copy message';
		copyBtn.onclick = () => copyMessageContent(messageDiv);
		copyBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>';

		headerDiv.appendChild(iconDiv);
		headerDiv.appendChild(labelDiv);
		headerDiv.appendChild(copyBtn);
		messageDiv.appendChild(headerDiv);
	}

	// Add content
	const contentDiv = document.createElement('div');
	contentDiv.className = 'message-content';

	if(type == 'user' || type === 'claude' || type === 'thinking'){
		contentDiv.innerHTML = content;
	} else {
		const preElement = document.createElement('pre');
		preElement.textContent = content;
		contentDiv.appendChild(preElement);
	}

	messageDiv.appendChild(contentDiv);

	// Check if this is a permission-related error and add yolo mode button
	if (type === 'error' && isPermissionError(content)) {
		const yoloSuggestion = document.createElement('div');
		yoloSuggestion.className = 'yolo-suggestion';
		yoloSuggestion.innerHTML = `
			<div class="yolo-suggestion-text">
				<span>💡 This looks like a permission issue. You can enable Yolo Mode to skip all permission checks.</span>
			</div>
			<button class="yolo-suggestion-btn" onclick="enableYoloMode()">Enable Yolo Mode</button>
		`;
		messageDiv.appendChild(yoloSuggestion);
	}

	messagesDiv.appendChild(messageDiv);
	// Mark Claude messages with streaming ID for appending
	if (type === 'claude') {
		messageDiv.dataset.streamingId = currentStreamingMessageId;
	}
	moveProcessingIndicatorToLast();
	scrollToBottomIfNeeded(messagesDiv, shouldScroll);
}

function sendMessage() {
	const message = messageInput.value.trim();
	if (!message) return;

	if (isProcessing) {
		// Check if Claude is executing a tool - if so, cancel and send immediately
		if (isExecutingTool) {
			// Cancel current operation and send new message
			vscode.postMessage({ type: 'stopRequest' });

			// Small delay to let cancellation process, then send
			setTimeout(() => {
				vscode.postMessage({
					type: 'message',
					content: message,
					planMode: planModeEnabled,
					thinkingMode: thinkingModeEnabled
				});
			}, 100);

			messageInput.value = '';
			adjustTextareaHeight();
			return;
		}

		// Claude is outputting text - queue the message
		messageQueue.push({
			content: message,
			planMode: planModeEnabled,
			thinkingMode: thinkingModeEnabled
		});

		// Show the queued message immediately in the UI
		addMessage(message, 'user');

		messageInput.value = '';
		adjustTextareaHeight();

		// Show visual feedback that message is queued
		const status = document.getElementById('statusText');
		if (status) {
			const queueCount = messageQueue.length;
			status.textContent = queueCount === 1
				? 'Message queued - will send when Claude finishes...'
				: `${queueCount} messages queued - will send when Claude finishes...`;
		}
	} else {
		// Send immediately if not processing
		vscode.postMessage({
			type: 'message',
			content: message,
			planMode: planModeEnabled,
			thinkingMode: thinkingModeEnabled
		});
		messageInput.value = '';
		adjustTextareaHeight();
		// Increment request count when user sends a message
		requestCount = (requestCount || 0) + 1;
		updateStatusWithTotals();
	}
}

function togglePlanMode() {
	planModeEnabled = !planModeEnabled;

	// Update UI
	const planModeSwitch = document.getElementById('planModeSwitch');
	if (planModeSwitch) {
		planModeSwitch.classList.toggle('active', planModeEnabled);
	}

	vscode.postMessage({
		type: 'togglePlanMode',
		enabled: planModeEnabled
	});
}

function toggleThinkingMode() {
	// Show the thinking intensity modal instead of simple toggle
	showThinkingIntensityModal();
}

function sendStats(eventName) {
	vscode.postMessage({ type: 'sendStats', eventName });
}
