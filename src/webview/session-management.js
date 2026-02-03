/**
 * session-management.js - Session & History Management
 *
 * Manages chat sessions and conversation history UI.
 * Handles: new session creation, history panel display,
 * conversation list rendering (with processing indicators),
 * and loading conversations from history.
 */

function newSession() {
	sendStats('New chat');
	hideGraph();
	vscode.postMessage({
		type: 'newSession'
	});
}

function restoreToCommit(commitSha) {
	vscode.postMessage({
		type: 'restoreCommit',
		commitSha: commitSha
	});
}

function showRestoreContainer(data) {
	const messagesDiv = document.getElementById('messages');
	const shouldScroll = shouldAutoScroll(messagesDiv);

	const restoreContainer = document.createElement('div');
	restoreContainer.className = 'restore-container';
	restoreContainer.id = `restore-${data.sha}`;

	const timeAgo = new Date(data.timestamp).toLocaleTimeString();
	const shortSha = data.sha ? data.sha.substring(0, 8) : 'unknown';

	restoreContainer.innerHTML = `
		<button class="restore-btn dark" onclick="restoreToCommit('${data.sha}')">
			Restore checkpoint
		</button>
		<span class="restore-date">${timeAgo}</span>
	`;

	messagesDiv.appendChild(restoreContainer);
	scrollToBottomIfNeeded(messagesDiv, shouldScroll);
}

function hideRestoreContainer(commitSha) {
	const container = document.getElementById(`restore-${commitSha}`);
	if (container) {
		container.remove();
	}
}

function showSessionInfo(sessionId) {
	const sessionStatus = document.getElementById('sessionStatus');
	const newSessionBtn = document.getElementById('newSessionBtn');
	const historyBtn = document.getElementById('historyBtn');

	if (sessionStatus && newSessionBtn) {
		sessionStatus.style.display = 'none';
		newSessionBtn.style.display = 'block';
		if (historyBtn) historyBtn.style.display = 'block';
	}
}

function copySessionId(sessionId) {
	navigator.clipboard.writeText(sessionId).then(() => {
		// Show temporary feedback
		const sessionIdSpan = document.getElementById('sessionId');
		if (sessionIdSpan) {
			const originalText = sessionIdSpan.textContent;
			sessionIdSpan.textContent = 'Copied!';
			setTimeout(() => {
				sessionIdSpan.textContent = originalText;
			}, 1000);
		}
	}).catch(err => {
		console.error('Failed to copy session ID:', err);
	});
}

function hideSessionInfo() {
	const sessionStatus = document.getElementById('sessionStatus');
	const newSessionBtn = document.getElementById('newSessionBtn');
	const historyBtn = document.getElementById('historyBtn');

	if (sessionStatus && newSessionBtn) {
		sessionStatus.style.display = 'none';
		newSessionBtn.style.display = 'block';
		if (historyBtn) historyBtn.style.display = 'block';
	}
}

function toggleConversationHistory() {
	const historyDiv = document.getElementById('conversationHistory');
	const chatContainer = document.getElementById('chatContainer');

	hideGraph();
	if (historyDiv.style.display === 'none' || historyDiv.style.display === '') {
		historyDiv.style.display = 'block';
		chatContainer.style.display = 'none';
		requestConversationList();
	} else {
		historyDiv.style.display = 'none';
		chatContainer.style.display = 'flex';
	}
}

function closeConversationHistory() {
	const historyDiv = document.getElementById('conversationHistory');
	const chatContainer = document.getElementById('chatContainer');
	hideGraph();
	historyDiv.style.display = 'none';
	chatContainer.style.display = 'flex';
}

function requestConversationList() {
	vscode.postMessage({
		type: 'getConversationList'
	});
}

function loadConversation(conversationId) {
	console.log('[loadConversation] Loading conversation:', conversationId);
	vscode.postMessage({
		type: 'loadConversation',
		filename: conversationId
	});
	// Note: History panel is closed in message-handler.js when conversationLoaded event is received
}

function displayConversationList(conversations) {
	console.log('[displayConversationList] Received conversations:', conversations);
	const conversationList = document.getElementById('conversationList');
	conversationList.innerHTML = '';

	if (!conversations || conversations.length === 0) {
		console.log('[displayConversationList] No conversations found');
		conversationList.innerHTML = '<div class="no-conversations">No conversation history found</div>';
		return;
	}

	console.log('[displayConversationList] Displaying', conversations.length, 'conversations');

	// Add a test click handler to the container
	conversationList.onclick = (e) => {
		console.log('[conversationList-click] Click detected on conversationList container', e.target);
	};

	conversations.forEach(conv => {
		const convItem = document.createElement('div');
		convItem.className = 'conversation-item';

		const date = new Date(conv.startTime);
		const dateStr = date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
		const preview = conv.summary || conv.firstUserMessage || 'New conversation';

		// Add processing indicator if conversation is processing
		const processingIndicator = conv.isProcessing ? '<span class="conversation-processing-dot" title="Processing"></span>' : '';

		convItem.innerHTML = `
			<div class="conversation-content">
				<div class="conversation-preview">${processingIndicator}${preview}</div>
				<div class="conversation-date">${dateStr}</div>
			</div>
			<div class="conversation-actions">
				<button class="btn outlined small open-in-panel-btn" onclick="event.stopPropagation(); openInNewPanel('${conv.filename}')" title="Open in new panel">
					📑
				</button>
			</div>
		`;

		convItem.addEventListener('click', (e) => {
			// Only load if not clicking on a button
			if (!e.target.classList.contains('open-in-panel-btn')) {
				console.log('[conversation-click] Clicked conversation:', conv.filename);
				e.stopPropagation();
				loadConversation(conv.filename);
			}
		});

		conversationList.appendChild(convItem);
	});
}

function openInNewPanel(filename) {
	console.log('[openInNewPanel] Opening conversation in new panel:', filename);
	vscode.postMessage({
		type: 'openConversationInNewPanel',
		filename: filename
	});
}

function handleClipboardText(text) {
	if (!text) return;

	// Insert at cursor position
	const cursorPos = messageInput.selectionStart;
	const textBefore = messageInput.value.substring(0, cursorPos);
	const textAfter = messageInput.value.substring(cursorPos);

	messageInput.value = textBefore + text + textAfter;
	messageInput.focus();

	const newCursorPos = cursorPos + text.length;
	messageInput.setSelectionRange(newCursorPos, newCursorPos);
	adjustTextareaHeight();
}
