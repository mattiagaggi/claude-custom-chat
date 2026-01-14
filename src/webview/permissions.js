/**
 * permissions.js - Permission Dialog UI
 *
 * Renders and manages permission request dialogs.
 * Handles: displaying tool permission prompts, approve/deny buttons,
 * "always allow" checkbox, and sending responses back to extension.
 */

function addPermissionRequestMessage(data) {
	console.log('[addPermissionRequestMessage] Received permission request:', data);

	const messagesDiv = document.getElementById('messages');
	const shouldScroll = shouldAutoScroll(messagesDiv);

	const messageDiv = document.createElement('div');
	messageDiv.className = 'message permission-request';
	messageDiv.id = `permission-${data.id}`;
	messageDiv.dataset.status = data.status || 'pending';

	const toolName = data.toolName || data.tool || 'Unknown Tool';
	const status = data.status || 'pending';

	console.log('[addPermissionRequestMessage] Rendering with:', { id: data.id, toolName, status });

	// Create always allow button text with command styling for Bash
	let alwaysAllowText = `Always allow ${toolName}`;
	let alwaysAllowTooltip = '';
	const pattern = data.pattern || (data.input && data.input.command);
	if (toolName === 'Bash' && pattern) {
		// Remove the asterisk for display - show "npm i" instead of "npm i *"
		const displayPattern = pattern.replace(' *', '');
		const truncatedPattern = displayPattern.length > 30 ? displayPattern.substring(0, 30) + '...' : displayPattern;
		alwaysAllowText = `Always allow <code>${truncatedPattern}</code>`;
		alwaysAllowTooltip = displayPattern.length > 30 ? `title="${displayPattern}"` : '';
	}

	// Show different content based on status
	let contentHtml = '';
	if (status === 'pending') {
		contentHtml = `
			<div class="permission-header">
				<span class="icon">🔐</span>
				<span>Permission Required</span>
				<div class="permission-menu">
					<button class="permission-menu-btn" onclick="togglePermissionMenu('${data.id}')" title="More options">⋮</button>
					<div class="permission-menu-dropdown" id="permissionMenu-${data.id}" style="display: none;">
						<button class="permission-menu-item" onclick="enableYoloMode('${data.id}')">
							<span class="menu-icon">⚡</span>
							<div class="menu-content">
								<span class="menu-title">Enable YOLO Mode</span>
								<span class="menu-subtitle">Auto-allow all permissions</span>
							</div>
						</button>
					</div>
				</div>
			</div>
			<div class="permission-content">
				<p>Allow <strong>${toolName}</strong> to execute the tool call above?</p>
				<div class="permission-buttons">
					<button class="btn deny" onclick="respondToPermission('${data.id}', false)">Deny</button>
					<button class="btn always-allow" onclick="respondToPermission('${data.id}', true, true)" ${alwaysAllowTooltip}>${alwaysAllowText}</button>
					<button class="btn allow" onclick="respondToPermission('${data.id}', true)">Allow</button>
				</div>
			</div>
		`;
	} else if (status === 'approved') {
		contentHtml = `
			<div class="permission-header">
				<span class="icon">🔐</span>
				<span>Permission Required</span>
			</div>
			<div class="permission-content">
				<p>Allow <strong>${toolName}</strong> to execute the tool call above?</p>
				<div class="permission-decision allowed">✅ You allowed this</div>
			</div>
		`;
		messageDiv.classList.add('permission-decided', 'allowed');
	} else if (status === 'denied') {
		contentHtml = `
			<div class="permission-header">
				<span class="icon">🔐</span>
				<span>Permission Required</span>
			</div>
			<div class="permission-content">
				<p>Allow <strong>${toolName}</strong> to execute the tool call above?</p>
				<div class="permission-decision denied">❌ You denied this</div>
			</div>
		`;
		messageDiv.classList.add('permission-decided', 'denied');
	} else if (status === 'cancelled' || status === 'expired') {
		contentHtml = `
			<div class="permission-header">
				<span class="icon">🔐</span>
				<span>Permission Required</span>
			</div>
			<div class="permission-content">
				<p>Allow <strong>${toolName}</strong> to execute the tool call above?</p>
				<div class="permission-decision expired">⏱️ This request expired</div>
			</div>
		`;
		messageDiv.classList.add('permission-decided', 'expired');
	}

	messageDiv.innerHTML = contentHtml;
	messagesDiv.appendChild(messageDiv);

	console.log('[addPermissionRequestMessage] Permission request added to DOM:', {
		id: data.id,
		status: messageDiv.dataset.status,
		buttonsPresent: messageDiv.querySelector('.permission-buttons') !== null,
		buttonsCount: messageDiv.querySelectorAll('.permission-buttons button').length
	});

	scrollToBottomIfNeeded(messagesDiv, shouldScroll);
}

function updatePermissionStatus(id, status) {
	const permissionMsg = document.getElementById(`permission-${id}`);
	if (!permissionMsg) return;

	permissionMsg.dataset.status = status;
	const permissionContent = permissionMsg.querySelector('.permission-content');
	const buttons = permissionMsg.querySelector('.permission-buttons');
	const menuDiv = permissionMsg.querySelector('.permission-menu');

	// Hide buttons and menu if present
	if (buttons) buttons.style.display = 'none';
	if (menuDiv) menuDiv.style.display = 'none';

	// Remove existing decision div if any
	const existingDecision = permissionContent.querySelector('.permission-decision');
	if (existingDecision) existingDecision.remove();

	// Add new decision div
	const decisionDiv = document.createElement('div');
	if (status === 'approved') {
		decisionDiv.className = 'permission-decision allowed';
		decisionDiv.innerHTML = '✅ You allowed this';
		permissionMsg.classList.add('permission-decided', 'allowed');
	} else if (status === 'denied') {
		decisionDiv.className = 'permission-decision denied';
		decisionDiv.innerHTML = '❌ You denied this';
		permissionMsg.classList.add('permission-decided', 'denied');
	} else if (status === 'cancelled' || status === 'expired') {
		decisionDiv.className = 'permission-decision expired';
		decisionDiv.innerHTML = '⏱️ This request expired';
		permissionMsg.classList.add('permission-decided', 'expired');
	}
	permissionContent.appendChild(decisionDiv);
}

function expireAllPendingPermissions() {
	document.querySelectorAll('.permission-request').forEach(permissionMsg => {
		if (permissionMsg.dataset.status === 'pending') {
			const id = permissionMsg.id.replace('permission-', '');
			updatePermissionStatus(id, 'expired');
		}
	});
}

function respondToPermission(id, approved, alwaysAllow = false) {
	console.log('[respondToPermission] Called with:', { id, approved, alwaysAllow });

	// Send response back to extension
	console.log('[respondToPermission] Sending message to extension');
	vscode.postMessage({
		type: 'permissionResponse',
		requestId: id,
		approved: approved,
		alwaysAllow: alwaysAllow
	});
	console.log('[respondToPermission] Message sent');

	// Update the UI to show the decision
	const permissionMsg = document.querySelector(`.permission-request:has([onclick*="${id}"])`);
	if (permissionMsg) {
		const buttons = permissionMsg.querySelector('.permission-buttons');
		const permissionContent = permissionMsg.querySelector('.permission-content');
		let decision = approved ? 'You allowed this' : 'You denied this';

		if (alwaysAllow && approved) {
			decision = 'You allowed this and set it to always allow';
		}

		const emoji = approved ? '✅' : '❌';
		const decisionClass = approved ? 'allowed' : 'denied';

		// Hide buttons
		buttons.style.display = 'none';

		// Add decision div to permission-content
		const decisionDiv = document.createElement('div');
		decisionDiv.className = `permission-decision ${decisionClass}`;
		decisionDiv.innerHTML = `${emoji} ${decision}`;
		permissionContent.appendChild(decisionDiv);

		permissionMsg.classList.add('permission-decided', decisionClass);
	}
}

function togglePermissionMenu(permissionId) {
	const menu = document.getElementById(`permissionMenu-${permissionId}`);
	const isVisible = menu.style.display !== 'none';

	// Close all other permission menus
	document.querySelectorAll('.permission-menu-dropdown').forEach(dropdown => {
		dropdown.style.display = 'none';
	});

	// Toggle this menu
	menu.style.display = isVisible ? 'none' : 'block';
}

function enableYoloMode(permissionId) {
	sendStats('YOLO mode enabled');

	// Hide the menu
	document.getElementById(`permissionMenu-${permissionId}`).style.display = 'none';

	// Send message to enable YOLO mode
	vscode.postMessage({
		type: 'enableYoloMode'
	});

	// Auto-approve this permission
	respondToPermission(permissionId, true);

	// Show notification
	addMessage('⚡ YOLO Mode enabled! All future permissions will be automatically allowed.', 'system');
}

function addUserQuestionMessage(data) {
	const messagesDiv = document.getElementById('messages');
	const shouldScroll = shouldAutoScroll(messagesDiv);

	const messageDiv = document.createElement('div');
	messageDiv.className = 'message user-question';
	messageDiv.id = `question-${data.id}`;

	const questions = data.questions || [];

	let questionsHtml = '';
	questions.forEach((q, idx) => {
		const questionId = `q${idx}`;
		const optionsHtml = q.options.map((opt, optIdx) => {
			const optionId = `${data.id}_${questionId}_opt${optIdx}`;
			return `
				<label class="question-option">
					<input type="${q.multiSelect ? 'checkbox' : 'radio'}"
						   name="${data.id}_${questionId}"
						   value="${optIdx}"
						   id="${optionId}">
					<div class="option-content">
						<div class="option-label">${opt.label}</div>
						<div class="option-description">${opt.description || ''}</div>
					</div>
				</label>
			`;
		}).join('');

		questionsHtml += `
			<div class="question-block">
				<div class="question-header">${q.header}</div>
				<div class="question-text">${q.question}</div>
				<div class="question-options">
					${optionsHtml}
				</div>
			</div>
		`;
	});

	messageDiv.innerHTML = `
		<div class="question-container">
			<div class="question-title">
				<span class="icon">❓</span>
				<span>Claude has questions for you</span>
			</div>
			${questionsHtml}
			<div class="question-buttons">
				<button class="btn primary" onclick="submitQuestionAnswers('${data.id}', ${questions.length})">Submit Answers</button>
			</div>
		</div>
	`;

	messagesDiv.appendChild(messageDiv);
	scrollToBottomIfNeeded(messagesDiv, shouldScroll);
}

function submitQuestionAnswers(questionId, questionCount) {
	const answers = {};

	for (let i = 0; i < questionCount; i++) {
		const questionKey = `q${i}`;
		const inputs = document.querySelectorAll(`input[name="${questionId}_${questionKey}"]:checked`);

		if (inputs.length > 0) {
			// Collect all selected values
			const values = Array.from(inputs).map(input => input.value);
			answers[questionKey] = values.length === 1 ? values[0] : values.join(',');
		}
	}

	// Send answers to extension
	vscode.postMessage({
		type: 'userQuestionResponse',
		requestId: questionId,
		answers: answers
	});

	// Hide the question UI
	const questionDiv = document.getElementById(`question-${questionId}`);
	if (questionDiv) {
		questionDiv.style.opacity = '0.5';
		questionDiv.style.pointerEvents = 'none';
		const buttons = questionDiv.querySelector('.question-buttons');
		if (buttons) buttons.style.display = 'none';
	}
}

function isPermissionError(content) {
	const permissionErrorPatterns = [
		'Error: MCP config file not found',
		'Error: MCP tool',
		'Claude requested permissions to use',
		'permission denied',
		'Permission denied',
		'permission request',
		'Permission request',
		'EACCES',
		'permission error',
		'Permission error'
	];

	return permissionErrorPatterns.some(pattern =>
		content.toLowerCase().includes(pattern.toLowerCase())
	);
}
