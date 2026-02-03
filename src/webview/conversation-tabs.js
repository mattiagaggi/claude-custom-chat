/**
 * conversation-tabs.js - Multi-Conversation Tab UI
 *
 * Manages the tab bar for switching between multiple active conversations.
 * Tracks active conversations, renders tab UI, handles tab switching,
 * and shows processing indicators on tabs.
 */

// Track active conversations (indexed by conversation ID)
let activeConversations = new Map();
let currentActiveConversationId = null;

/**
 * Add a new conversation tab
 */
function addConversationTab(conversationId, title = 'New Chat') {
	activeConversations.set(conversationId, {
		id: conversationId,
		title: title,
		hasNewMessages: false,
		newMessageCount: 0,
		isProcessing: false
	});

	renderConversationTabs();
}

/**
 * Remove a conversation tab
 */
function removeConversationTab(conversationId) {
	activeConversations.delete(conversationId);
	renderConversationTabs();

	// If we closed the active conversation, switch to another one
	if (currentActiveConversationId === conversationId) {
		const remainingConversations = Array.from(activeConversations.keys());
		if (remainingConversations.length > 0) {
			switchToConversation(remainingConversations[0]);
		} else {
			currentActiveConversationId = null;
		}
	}
}

/**
 * Switch to a specific conversation
 */
function switchToConversation(conversationId) {
	console.log('[switchToConversation] Called with:', conversationId, 'current viewed:', window.currentViewedConversationId);
	if (!activeConversations.has(conversationId)) {
		console.error('Cannot switch to conversation', conversationId, '- not found');
		return;
	}

	// Clear new messages flag
	const conversation = activeConversations.get(conversationId);
	if (conversation) {
		conversation.hasNewMessages = false;
		conversation.newMessageCount = 0;
	}

	currentActiveConversationId = conversationId;

	// IMMEDIATELY update the viewed conversation ID to prevent messages from
	// the previous conversation's stream from appearing in this view
	// This is stored on window so it's shared with message-handler.js
	window.currentViewedConversationId = conversationId;
	console.log('[switchToConversation] Set window.currentViewedConversationId =', conversationId);

	// Clear any streaming state from the previous conversation
	if (window.streamingState && window.streamingState.conversationId !== conversationId) {
		if (window.streamingState.timeout) {
			clearTimeout(window.streamingState.timeout);
		}
		window.streamingState = null;
		window.currentStreamingMessageId = null;
	}

	hideGraph();
	renderConversationTabs();

	// Send message to extension to switch conversation
	vscode.postMessage({
		type: 'switchConversation',
		conversationId: conversationId
	});
}

/**
 * Update conversation title
 */
function updateConversationTitle(conversationId, title) {
	const conversation = activeConversations.get(conversationId);
	if (conversation) {
		conversation.title = title;
		renderConversationTabs();
	}
}

/**
 * Mark conversation as having new messages
 */
function markConversationWithNewMessages(conversationId, increment = 1) {
	const conversation = activeConversations.get(conversationId);
	if (conversation && conversationId !== currentActiveConversationId) {
		conversation.hasNewMessages = true;
		conversation.newMessageCount += increment;
		renderConversationTabs();
	}
}

/**
 * Set conversation processing state
 */
function setConversationProcessing(conversationId, isProcessing) {
	const conversation = activeConversations.get(conversationId);
	if (conversation) {
		conversation.isProcessing = isProcessing;
		renderConversationTabs();
	}
}

/**
 * Render all conversation tabs
 */
function renderConversationTabs() {
	const tabsContainer = document.getElementById('activeConversationTabs');
	const tabsList = document.getElementById('conversationTabsList');

	if (!tabsContainer || !tabsList) {
		return;
	}

	// Show tab bar only if there are conversation tabs or graph tab is open
	const hasTabs = activeConversations.size > 0 || window._graphTabOpen;
	tabsContainer.style.display = hasTabs ? 'flex' : 'none';

	// Clear existing tabs
	tabsList.innerHTML = '';

	// Add clear all button if 2 or more tabs
	let clearAllBtn = tabsContainer.querySelector('.clear-all-tabs-btn');
	if (activeConversations.size >= 2) {
		if (!clearAllBtn) {
			console.log('[renderConversationTabs] Creating clear all button');
			clearAllBtn = document.createElement('button');
			clearAllBtn.className = 'clear-all-tabs-btn';
			clearAllBtn.title = 'Close all other tabs';
			clearAllBtn.textContent = 'Close All';
			clearAllBtn.addEventListener('click', (e) => {
				e.preventDefault();
				e.stopPropagation();
				console.log('[clearAllBtn] Click event fired');
				clearAllTabs();
			});
			tabsContainer.appendChild(clearAllBtn);
		}
	} else if (clearAllBtn) {
		clearAllBtn.remove();
	}

	// Render each conversation tab
	activeConversations.forEach((conversation, conversationId) => {
		const tab = document.createElement('div');
		tab.className = 'conversation-tab';
		if (conversationId === currentActiveConversationId && !window._graphTabActive) {
			tab.classList.add('active');
		}

		// Tab title
		const title = document.createElement('span');
		title.className = 'conversation-tab-title';
		title.textContent = conversation.title;
		tab.appendChild(title);

		// Badge for new messages
		if (conversation.hasNewMessages && conversation.newMessageCount > 0) {
			const badge = document.createElement('span');
			badge.className = 'conversation-tab-badge';
			badge.textContent = conversation.newMessageCount;
			tab.appendChild(badge);
		}

		// Processing indicator with stop button
		if (conversation.isProcessing) {
			const processingIndicator = document.createElement('div');
			processingIndicator.className = 'conversation-tab-processing';
			tab.appendChild(processingIndicator);

			// Add stop button for processing conversations
			const stopBtn = document.createElement('span');
			stopBtn.className = 'conversation-tab-stop';
			stopBtn.innerHTML = '■';
			stopBtn.title = 'Stop process';
			stopBtn.addEventListener('click', (e) => {
				e.preventDefault();
				e.stopPropagation();
				console.log('[stopBtn] Stopping conversation:', conversationId);
				vscode.postMessage({
					type: 'stopConversation',
					conversationId: conversationId
				});
			});
			tab.appendChild(stopBtn);
		}

		// Close button
		const closeBtn = document.createElement('span');
		closeBtn.className = 'conversation-tab-close';
		closeBtn.innerHTML = '✕';
		closeBtn.addEventListener('click', (e) => {
			e.preventDefault();
			e.stopPropagation();
			console.log('[closeBtn] Clicked for conversation:', conversationId);
			closeConversationTab(conversationId);
		});
		tab.appendChild(closeBtn);

		// Click handler to switch conversation
		tab.onclick = () => {
			if (conversationId !== currentActiveConversationId || window._graphTabActive) {
				switchToConversation(conversationId);
			}
		};

		tabsList.appendChild(tab);
	});

	// Add closeable Graph tab when open
	if (window._graphTabOpen) {
		const graphTab = document.createElement('div');
		graphTab.className = 'conversation-tab graph-tab';
		if (window._graphTabActive) {
			graphTab.classList.add('active');
		}

		const graphTitle = document.createElement('span');
		graphTitle.className = 'conversation-tab-title';
		graphTitle.textContent = 'Graph';
		graphTab.appendChild(graphTitle);

		const closeBtn = document.createElement('span');
		closeBtn.className = 'conversation-tab-close';
		closeBtn.innerHTML = '✕';
		closeBtn.addEventListener('click', (e) => {
			e.preventDefault();
			e.stopPropagation();
			closeGraphTab();
		});
		graphTab.appendChild(closeBtn);

		graphTab.onclick = () => switchMainTab('graph');
		tabsList.appendChild(graphTab);
	}
}

/**
 * Close a conversation tab with confirmation if it has unsaved changes
 */
function closeConversationTab(conversationId) {
	const conversation = activeConversations.get(conversationId);
	if (!conversation) {
		return;
	}

	// If this is the only conversation, just create a new one instead of closing
	if (activeConversations.size === 1) {
		newSession();
		return;
	}

	// Ask for confirmation if conversation is processing
	if (conversation.isProcessing) {
		if (!confirm('This conversation has an active process. Close anyway?')) {
			return;
		}
	}

	// Remove the tab
	removeConversationTab(conversationId);

	// Tell extension to close the conversation
	vscode.postMessage({
		type: 'closeConversation',
		conversationId: conversationId
	});
}

/**
 * Initialize conversation tabs on page load
 */
function initializeConversationTabs() {
	// Request active conversations from extension
	vscode.postMessage({
		type: 'getActiveConversations'
	});
}

/**
 * Handle active conversations list from extension
 */
function handleActiveConversationsList(conversations) {
	activeConversations.clear();

	conversations.forEach(conv => {
		activeConversations.set(conv.id, {
			id: conv.id,
			title: conv.title || 'Chat',
			hasNewMessages: conv.hasNewMessages || false,
			newMessageCount: conv.newMessageCount || 0,
			isProcessing: conv.isProcessing || false
		});

		if (conv.isActive) {
			currentActiveConversationId = conv.id;
		}
	});

	renderConversationTabs();
}

/**
 * Clear all tabs except the current one
 */
function clearAllTabs() {
	console.log('[clearAllTabs] Called, current:', currentActiveConversationId, 'total tabs:', activeConversations.size);

	// Get all conversation IDs except the current one
	const tabsToClose = [];
	activeConversations.forEach((_, conversationId) => {
		if (conversationId !== currentActiveConversationId) {
			tabsToClose.push(conversationId);
		}
	});

	console.log('[clearAllTabs] Closing tabs:', tabsToClose);

	// Close each tab
	tabsToClose.forEach(conversationId => {
		activeConversations.delete(conversationId);
		vscode.postMessage({
			type: 'closeConversation',
			conversationId: conversationId
		});
	});

	renderConversationTabs();
}
