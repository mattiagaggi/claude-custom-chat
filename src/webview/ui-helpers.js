/**
 * ui-helpers.js - Common UI Utilities
 *
 * Shared UI helper functions used across webview modules.
 * Handles: auto-scroll detection, processing indicators,
 * button enable/disable, status bar updates, timer display.
 */

function shouldAutoScroll(messagesDiv) {
	const threshold = 100; // pixels from bottom
	const scrollTop = messagesDiv.scrollTop;
	const scrollHeight = messagesDiv.scrollHeight;
	const clientHeight = messagesDiv.clientHeight;

	return (scrollTop + clientHeight >= scrollHeight - threshold);
}

function scrollToBottomIfNeeded(messagesDiv, shouldScroll = null) {
	// If shouldScroll is not provided, check current scroll position
	if (shouldScroll === null) {
		shouldScroll = shouldAutoScroll(messagesDiv);
	}

	if (shouldScroll) {
		messagesDiv.scrollTop = messagesDiv.scrollHeight;
	}
}

function openDiffEditor() {
	if (lastPendingEditData) {
		vscode.postMessage({
			type: 'openDiff',
			filePath: lastPendingEditData.filePath,
			oldContent: lastPendingEditData.oldContent,
			newContent: lastPendingEditData.newContent
		});
	}
}

function updateStatus(text, state = 'ready') {
	statusTextDiv.textContent = text;
	statusDiv.className = `status ${state}`;
}

function updateStatusHtml(html, state = 'ready') {
	statusTextDiv.innerHTML = html;
	statusDiv.className = `status ${state}`;
}

function viewUsage(usageType) {
	vscode.postMessage({ type: 'viewUsage', usageType: usageType });
}

function updateStatusWithTotals() {
	if (isProcessing) {
		// While processing, show input/output tokens and elapsed time
		const tokensStr = formatTokensStr(totalTokensInput, totalTokensOutput);

		let elapsedStr = '';
		if (requestStartTime) {
			const elapsedSeconds = Math.floor((Date.now() - requestStartTime) / 1000);
			elapsedStr = ` • ${elapsedSeconds}s`;
		}

		const statusText = tokensStr ? `Processing • ${tokensStr}${elapsedStr}` : `Processing${elapsedStr}`;
		updateStatus(statusText, 'processing');
	} else {
		// When ready, show full info
		let usageStr;
		const usageIcon = `<svg class="usage-icon" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
			<rect x="1" y="8" width="3" height="6" rx="0.5" fill="currentColor" opacity="0.5"/>
			<rect x="5.5" y="5" width="3" height="9" rx="0.5" fill="currentColor" opacity="0.7"/>
			<rect x="10" y="2" width="3" height="12" rx="0.5" fill="currentColor"/>
		</svg>`;
		if (subscriptionType) {
			// Extract just the plan type
			let planName = subscriptionType.replace(/^claude\s*/i, '').trim();
			planName = planName.charAt(0).toUpperCase() + planName.slice(1);
			usageStr = `<a href="#" onclick="event.preventDefault(); viewUsage('plan');" class="usage-badge" title="View live usage">${planName} Plan${usageIcon}</a>`;
		} else {
			const costStr = totalCost > 0 ? `$${totalCost.toFixed(4)}` : '$0.00';
			usageStr = `<a href="#" onclick="event.preventDefault(); viewUsage('api');" class="usage-badge" title="View usage">${costStr}${usageIcon}</a>`;
		}
		const tokensStr = formatTokensStr(totalTokensInput, totalTokensOutput);
		const requestStr = requestCount > 0 ? `${requestCount} requests` : '';

		// Calculate context usage (use actual context from this turn, not cumulative tokens)
		const contextStr = formatContextUsage(currentContextUsed, contextWindow);

		// Build status text, omitting empty parts
		const parts = ['Ready'];
		if (tokensStr) parts.push(tokensStr);
		if (requestStr) parts.push(requestStr);
		if (contextStr) parts.push(contextStr);
		parts.push(usageStr);

		const statusText = parts.join(' • ');
		updateStatusHtml(statusText, 'ready');
	}
}

/**
 * Format context window usage for display
 * Shows percentage and warns if over 80%
 */
function formatContextUsage(inputTokens, maxContext) {
	// Return empty string if no context data yet (new conversation)
	if (!maxContext || maxContext === 0 || !inputTokens || inputTokens === 0) {
		return '';
	}

	const percentage = Math.min(100, Math.round((inputTokens / maxContext) * 100));
	const formatNum = (n) => {
		if (n >= 1000000) return (n / 1000000).toFixed(0) + 'M';
		if (n >= 1000) return (n / 1000).toFixed(0) + 'k';
		return n.toString();
	};

	const usedStr = formatNum(inputTokens);
	const maxStr = formatNum(maxContext);

	// Determine color based on usage
	let colorClass = 'context-ok';
	let warningIcon = '';
	if (percentage >= 90) {
		colorClass = 'context-critical';
		warningIcon = ' ⚠️';
	} else if (percentage >= 80) {
		colorClass = 'context-warning';
		warningIcon = ' ⚡';
	}

	return `<span class="context-usage ${colorClass}" title="Context window: ${inputTokens.toLocaleString()} / ${maxContext.toLocaleString()} tokens (${percentage}%)">${usedStr}/${maxStr}${warningIcon}</span>`;
}

/**
 * Format token counts for display
 * Shows input↑ output↓ format for clarity on billing
 */
function formatTokensStr(input, output) {
	if (input === 0 && output === 0) {
		return '';
	}
	// Format: "12.3k↑ 4.5k↓" for input/output
	const formatNum = (n) => {
		if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
		if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
		return n.toString();
	};
	return `${formatNum(input)}↑ ${formatNum(output)}↓`;
}

function startRequestTimer(startTime = undefined) {
	requestStartTime = startTime || Date.now();
	// Update status every 100ms for smooth real-time display
	requestTimer = setInterval(() => {
		if (isProcessing) {
			updateStatusWithTotals();
		}
	}, 100);
}

function stopRequestTimer() {
	if (requestTimer) {
		clearInterval(requestTimer);
		requestTimer = null;
	}
	requestStartTime = null;
}

function showProcessingIndicator() {
	// Remove any existing indicator first
	hideProcessingIndicator();

	// Create the indicator and append after all messages
	const indicator = document.createElement('div');
	indicator.className = 'processing-indicator';
	indicator.innerHTML = '<div class="morph-dot"></div>';
	messagesDiv.appendChild(indicator);
}

function hideProcessingIndicator() {
	const indicator = document.querySelector('.processing-indicator');
	if (indicator) {
		indicator.remove();
	}
}

function moveProcessingIndicatorToLast() {
	// Only move if we're processing
	if (isProcessing) {
		showProcessingIndicator();
	}
}

function adjustTextareaHeight() {
	// Reset height to calculate new height
	messageInput.style.height = 'auto';

	// Get computed styles
	const computedStyle = getComputedStyle(messageInput);
	const lineHeight = parseFloat(computedStyle.lineHeight);
	const paddingTop = parseFloat(computedStyle.paddingTop);
	const paddingBottom = parseFloat(computedStyle.paddingBottom);
	const borderTop = parseFloat(computedStyle.borderTopWidth);
	const borderBottom = parseFloat(computedStyle.borderBottomWidth);

	// Calculate heights
	const scrollHeight = messageInput.scrollHeight;
	const maxRows = 5;
	const minHeight = lineHeight + paddingTop + paddingBottom + borderTop + borderBottom;
	const maxHeight = (lineHeight * maxRows) + paddingTop + paddingBottom + borderTop + borderBottom;

	// Set height
	if (scrollHeight <= maxHeight) {
		messageInput.style.height = Math.max(scrollHeight, minHeight) + 'px';
		messageInput.style.overflowY = 'hidden';
	} else {
		messageInput.style.height = maxHeight + 'px';
		messageInput.style.overflowY = 'auto';
	}
}

function showStopButton() {
	document.getElementById('stopBtn').style.display = 'flex';
}

function hideStopButton() {
	document.getElementById('stopBtn').style.display = 'none';
}

function stopRequest() {
	sendStats('Stop request');

	// Clear the message queue when stopping
	messageQueue.length = 0;

	vscode.postMessage({
		type: 'stopRequest'
	});
	hideStopButton();
}

function disableButtons() {
	const sendBtn = document.getElementById('sendBtn');
	if (sendBtn) {
		// Keep send button enabled so users can queue messages
		// Just update the visual appearance
		sendBtn.classList.add('queuing-mode');
		sendBtn.title = 'Send message (will queue until Claude finishes)';
	}
}

function enableButtons() {
	const sendBtn = document.getElementById('sendBtn');
	if (sendBtn) {
		sendBtn.classList.remove('queuing-mode');
		sendBtn.title = 'Send message';
	}
}

function toggleExpand(button) {
	if (!button) return;

	const container = button.parentElement;
	if (!container) return;

	// Check if this is an expand button with data attributes (from diff-formatting)
	if (button.hasAttribute('data-value')) {
		const isExpanded = button.classList.contains('expanded');
		const key = button.getAttribute('data-key');
		const value = button.getAttribute('data-value');

		if (isExpanded) {
			// Collapse - show truncated version
			const truncated = value.substring(0, 97) + '...';
			container.innerHTML = '<strong>' + key + ':</strong> ' + truncated + ' <span class="expand-btn" data-key="' + key + '" data-value="' + value + '" onclick="toggleExpand(this)">expand</span>';
		} else {
			// Expand - show full value
			button.classList.add('expanded');
			container.innerHTML = '<strong>' + key + ':</strong> ' + value + ' <span class="expand-btn expanded" data-key="' + key + '" data-value="' + value + '" onclick="toggleExpand(this)">collapse</span>';
		}
		return;
	}

	// Handle other expandable content (if any)
	const content = container.querySelector('.expandable-content');
	if (!content) return;

	const isExpanded = button.classList.contains('expanded');

	if (isExpanded) {
		// Collapse
		button.classList.remove('expanded');
		content.classList.add('truncated');
		button.innerHTML = '<svg width="10" height="10" viewBox="0 0 10 10"><path d="M 2 4 L 5 7 L 8 4" stroke="currentColor" fill="none" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>Expand';
	} else {
		// Expand
		button.classList.add('expanded');
		content.classList.remove('truncated');
		button.innerHTML = '<svg width="10" height="10" viewBox="0 0 10 10"><path d="M 2 6 L 5 3 L 8 6" stroke="currentColor" fill="none" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>Collapse';
	}
}

function toggleDiffExpansion(diffId) {
	const hiddenDiv = document.getElementById(diffId + '_hidden');
	const button = document.querySelector('[onclick*="' + diffId + '"]');

	if (hiddenDiv && button) {
		if (hiddenDiv.style.display === 'none') {
			hiddenDiv.style.display = 'block';
			button.textContent = 'Show less';
		} else {
			hiddenDiv.style.display = 'none';
			const hiddenLines = hiddenDiv.querySelectorAll('.diff-line').length;
			button.textContent = 'Show ' + hiddenLines + ' more lines';
		}
	}
}

function toggleResultExpansion(resultId) {
	const hiddenDiv = document.getElementById(resultId + '_hidden');
	const button = document.querySelector('[onclick*="' + resultId + '"]');
	const visibleDiv = document.getElementById(resultId + '_visible');

	if (hiddenDiv && button && visibleDiv) {
		if (hiddenDiv.style.display === 'none') {
			hiddenDiv.style.display = 'block';
			button.textContent = 'Show less';
			visibleDiv.style.borderBottom = '1px solid var(--border-color)';
		} else {
			hiddenDiv.style.display = 'none';
			const totalLines = hiddenDiv.querySelectorAll('.result-line').length;
			button.textContent = 'Show ' + totalLines + ' more lines';
			visibleDiv.style.borderBottom = '';
		}
	}
}

function copyMessageContent(messageDiv) {
	const contentDiv = messageDiv.querySelector('.message-content');
	if (contentDiv) {
		const textContent = contentDiv.innerText;
		const copyBtn = messageDiv.querySelector('.copy-btn');

		const showSuccess = () => {
			if (!copyBtn) return;
			const originalHtml = copyBtn.innerHTML;
			copyBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>';
			copyBtn.style.color = '#4caf50';

			setTimeout(() => {
				copyBtn.innerHTML = originalHtml;
				copyBtn.style.color = '';
			}, 1000);
		};

		// Try clipboard API first, fall back to VS Code clipboard if it fails
		navigator.clipboard.writeText(textContent).then(showSuccess).catch(() => {
			// Fallback: use VS Code extension to copy (handles focus issues in webview)
			vscode.postMessage({ type: 'copyToClipboard', text: textContent });
			showSuccess();
		});
	}
}

function toggleDevMode() {
	sendStats('Toggle dev mode');
	const devModeBtn = document.getElementById('devModeBtn');
	const isActive = devModeBtn?.classList.contains('active');

	vscode.postMessage({
		type: 'toggleDevMode',
		enable: !isActive
	});

	// Update button state (will be confirmed by extension)
	if (devModeBtn) {
		if (isActive) {
			devModeBtn.classList.remove('active');
			devModeBtn.style.background = '';
			devModeBtn.title = 'Dev Mode - Make this extension self-modifiable';
			// Hide push buttons
			updatePushButtonsVisibility(false);
		} else {
			devModeBtn.classList.add('active');
			devModeBtn.style.background = 'var(--vscode-button-background)';
			devModeBtn.style.color = 'var(--vscode-button-foreground)';
			devModeBtn.title = 'Dev Mode Active - Extension is self-modifiable';
			// Show push buttons
			updatePushButtonsVisibility(true);
		}
	}
}

/**
 * Insert @ symbol and trigger file autocomplete
 * Called when user clicks the @ button
 */
function insertAtSymbol() {
	const input = messageInput;
	const cursorPos = input.selectionStart;
	const textBefore = input.value.substring(0, cursorPos);
	const textAfter = input.value.substring(cursorPos);

	// Insert @ at cursor position
	input.value = textBefore + '@' + textAfter;

	// Move cursor after the @
	const newCursorPos = cursorPos + 1;
	input.setSelectionRange(newCursorPos, newCursorPos);

	// Focus the input
	input.focus();

	// Trigger the file autocomplete check
	checkFileAutocomplete();

	// Adjust textarea height
	adjustTextareaHeight();
}
