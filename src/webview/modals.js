// Modal management functions (settings, slash commands, model selector, etc.)

// Slash commands modal
function showSlashCommandsModal() {
	document.getElementById('slashCommandsModal').style.display = 'flex';
	setTimeout(() => {
		document.getElementById('slashCommandsSearch').focus();
	}, 100);
}

function hideSlashCommandsModal() {
	document.getElementById('slashCommandsModal').style.display = 'none';
}

// Model selector
function showModelSelector() {
	document.getElementById('modelModal').style.display = 'flex';
}

function hideModelModal() {
	document.getElementById('modelModal').style.display = 'none';
}

function selectModel(model) {
	currentModel = model;
	document.getElementById('selectedModel').textContent = model;
	vscode.postMessage({ type: 'selectModel', model: model });
	hideModelModal();
}

function openModelTerminal() {
	vscode.postMessage({ type: 'openModelTerminal' });
	hideModelModal();
}

// Thinking intensity modal
function showThinkingIntensityModal() {
	vscode.postMessage({ type: 'getSettings' });
	document.getElementById('thinkingIntensityModal').style.display = 'flex';
}

function hideThinkingIntensityModal() {
	document.getElementById('thinkingIntensityModal').style.display = 'none';
}

function saveThinkingIntensity() {
	const thinkingSlider = document.getElementById('thinkingIntensitySlider');
	const intensityValues = ['think', 'think-hard', 'think-harder', 'ultrathink'];
	const thinkingIntensity = intensityValues[thinkingSlider.value] || 'think';

	vscode.postMessage({
		type: 'updateSettings',
		settings: {
			'thinking.intensity': thinkingIntensity
		}
	});
}

function updateThinkingModeToggleName(intensityValue) {
	const intensityNames = ['Thinking', 'Think Hard', 'Think Harder', 'Ultrathink'];
	const modeName = intensityNames[intensityValue] || 'Thinking';
	const toggleLabel = document.getElementById('thinkingModeLabel');
	if (toggleLabel) {
		toggleLabel.textContent = modeName + ' Mode';
	}
}

function updateThinkingIntensityDisplay(value) {
	for (let i = 0; i < 4; i++) {
		const label = document.getElementById('thinking-label-' + i);
		if (i == value) {
			label.classList.add('active');
		} else {
			label.classList.remove('active');
		}
	}
}

function setThinkingIntensityValue(value) {
	document.getElementById('thinkingIntensitySlider').value = value;
	updateThinkingIntensityDisplay(value);
}

function confirmThinkingIntensity() {
	const currentValue = document.getElementById('thinkingIntensitySlider').value;
	updateThinkingModeToggleName(currentValue);
	saveThinkingIntensity();
	hideThinkingIntensityModal();
}

// WSL Alert
function showWSLAlert() {
	const alert = document.getElementById('wslAlert');
	if (alert) alert.style.display = 'block';
}

function dismissWSLAlert() {
	const alert = document.getElementById('wslAlert');
	if (alert) alert.style.display = 'none';
	vscode.postMessage({ type: 'dismissWSLAlert' });
}

function openWSLSettings() {
	dismissWSLAlert();
	toggleSettings();
}

// Settings modal
function toggleSettings() {
	const settingsModal = document.getElementById('settingsModal');
	if (settingsModal.style.display === 'flex') {
		hideSettingsModal();
	} else {
		settingsModal.style.display = 'flex';
		vscode.postMessage({ type: 'getSettings' });
		vscode.postMessage({ type: 'getPermissions' });
	}
}

function hideSettingsModal() {
	document.getElementById('settingsModal').style.display = 'none';
}

function updateSettings() {
	const settings = {
		'wsl.enabled': document.getElementById('wsl-enabled').checked,
		'wsl.distro': document.getElementById('wsl-distro').value,
		'wsl.nodePath': document.getElementById('wsl-node-path').value,
		'wsl.claudePath': document.getElementById('wsl-claude-path').value,
		'permissions.yoloMode': document.getElementById('yolo-mode').checked
	};

	vscode.postMessage({
		type: 'updateSettings',
		settings: settings
	});

	updateYoloWarning();
}

// Permissions management in settings
function renderPermissions(permissions) {
	const permissionsList = document.getElementById('permissionsList');
	permissionsList.innerHTML = '';

	if (!permissions || permissions.length === 0) {
		permissionsList.innerHTML = '<div class="no-permissions">No always-allow permissions configured</div>';
		return;
	}

	permissions.forEach((permission, index) => {
		const permissionItem = document.createElement('div');
		permissionItem.className = 'permission-item';

		const displayText = permission.command ?
			permission.tool + ': ' + permission.command :
			permission.tool;

		permissionItem.innerHTML = `
			<div class="permission-text">${displayText}</div>
			<button class="btn outlined small danger" onclick="removePermission(${index})">Remove</button>
		`;

		permissionsList.appendChild(permissionItem);
	});
}

function removePermission(index) {
	vscode.postMessage({
		type: 'removePermission',
		index: index
	});
}

function showAddPermissionForm() {
	document.getElementById('addPermissionForm').style.display = 'block';
	document.getElementById('addPermissionBtn').style.display = 'none';
}

function hideAddPermissionForm() {
	document.getElementById('addPermissionForm').style.display = 'none';
	document.getElementById('addPermissionBtn').style.display = 'block';
	document.getElementById('permissionTool').value = 'Bash';
	document.getElementById('permissionCommand').value = '';
	toggleCommandInput();
}

function toggleCommandInput() {
	const tool = document.getElementById('permissionTool').value;
	const commandGroup = document.getElementById('permissionCommandGroup');

	if (tool === 'Bash') {
		commandGroup.style.display = 'block';
	} else {
		commandGroup.style.display = 'none';
	}
}

function addPermission() {
	const tool = document.getElementById('permissionTool').value;
	const command = document.getElementById('permissionCommand').value.trim();

	const permission = { tool: tool };
	if (tool === 'Bash' && command) {
		permission.command = command;
	}

	vscode.postMessage({
		type: 'addPermission',
		permission: permission
	});

	hideAddPermissionForm();
}

// Installation modal
function showInstallModal() {
	const modal = document.getElementById('installModal');
	if (modal) {
		modal.style.display = 'flex';
		document.getElementById('installMain').style.display = 'flex';
		document.getElementById('installProgress').style.display = 'none';
		document.getElementById('installSuccess').style.display = 'none';
	}
	sendStats('Install modal shown');
}

function hideInstallModal() {
	document.getElementById('installModal').style.display = 'none';
}

function startInstallation() {
	sendStats('Install started');
	document.getElementById('installMain').style.display = 'none';
	document.getElementById('installProgress').style.display = 'flex';
	vscode.postMessage({ type: 'runInstallCommand' });
}

function handleInstallComplete(success, error) {
	document.getElementById('installProgress').style.display = 'none';
	const successEl = document.getElementById('installSuccess');
	successEl.style.display = 'flex';

	if (success) {
		sendStats('Install success');
		successEl.querySelector('.install-success-text').textContent = 'Installed';
		successEl.querySelector('.install-success-hint').textContent = 'Send a message to get started';
	} else {
		sendStats('Install failed');
		successEl.querySelector('.install-check').style.display = 'none';
		successEl.querySelector('.install-success-text').textContent = 'Installation failed';
		successEl.querySelector('.install-success-hint').textContent = error || 'Try installing manually from claude.ai/download';
	}
}

// Slash commands and custom snippets
function executeSlashCommand(command) {
	hideSlashCommandsModal();
	messageInput.value = '';
	vscode.postMessage({
		type: 'executeSlashCommand',
		command: command
	});
}

function handleCustomCommandKeydown(event) {
	if (event.key === 'Enter') {
		event.preventDefault();
		const customCommand = event.target.value.trim();
		if (customCommand) {
			executeSlashCommand(customCommand);
			event.target.value = '';
		}
	}
}

function usePromptSnippet(snippetType) {
	hideSlashCommandsModal();
	vscode.postMessage({
		type: 'usePromptSnippet',
		snippetType: snippetType
	});
}

function showAddSnippetForm() {
	document.getElementById('addSnippetForm').style.display = 'block';
}

function hideAddSnippetForm() {
	document.getElementById('addSnippetForm').style.display = 'none';
	document.getElementById('snippetName').value = '';
	document.getElementById('snippetText').value = '';
}

function saveCustomSnippet() {
	const name = document.getElementById('snippetName').value.trim();
	const text = document.getElementById('snippetText').value.trim();

	if (!name || !text) {
		alert('Please provide both name and text for the snippet');
		return;
	}

	vscode.postMessage({
		type: 'saveCustomSnippet',
		name: name,
		text: text
	});

	hideAddSnippetForm();
}

function loadCustomSnippets(snippets) {
	customSnippetsData = snippets || {};
	const container = document.getElementById('customSnippets');
	container.innerHTML = '';

	for (const [name, text] of Object.entries(customSnippetsData)) {
		const snippetBtn = document.createElement('button');
		snippetBtn.className = 'slash-command-item';
		snippetBtn.innerHTML = `
			<div class="slash-command-info">
				<div class="slash-command-name">${name}</div>
				<div class="slash-command-desc">${text.substring(0, 50)}...</div>
			</div>
			<button class="btn outlined small" onclick="deleteCustomSnippet('${name}')">Delete</button>
		`;
		snippetBtn.onclick = (e) => {
			if (!e.target.classList.contains('btn')) {
				usePromptSnippet(name);
			}
		};
		container.appendChild(snippetBtn);
	}
}

function deleteCustomSnippet(name) {
	vscode.postMessage({
		type: 'deleteCustomSnippet',
		name: name
	});
}

function filterSlashCommands() {
	const searchTerm = document.getElementById('slashCommandsSearch').value.toLowerCase();
	const commands = document.querySelectorAll('.slash-command-item');

	commands.forEach(cmd => {
		const name = cmd.querySelector('.slash-command-name').textContent.toLowerCase();
		const desc = cmd.querySelector('.slash-command-desc').textContent.toLowerCase();

		if (name.includes(searchTerm) || desc.includes(searchTerm)) {
			cmd.style.display = '';
		} else {
			cmd.style.display = 'none';
		}
	});
}
