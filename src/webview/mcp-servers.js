/**
 * mcp-servers.js - MCP Server Configuration UI
 *
 * Manages the MCP (Model Context Protocol) server configuration modal.
 * Handles: displaying server list, adding/editing/removing servers,
 * popular server gallery, and saving configuration changes.
 */

function showMCPModal() {
	document.getElementById('mcpModal').style.display = 'flex';
	loadMCPServers();
}

function hideMCPModal() {
	document.getElementById('mcpModal').style.display = 'none';
	hideAddServerForm();
}

function loadMCPServers() {
	vscode.postMessage({ type: 'loadMCPServers' });
}

function showAddServerForm() {
	document.getElementById('addServerBtn').style.display = 'none';
	document.getElementById('popularServers').style.display = 'none';
	document.getElementById('addServerForm').style.display = 'block';
}

function hideAddServerForm() {
	document.getElementById('addServerBtn').style.display = 'block';
	document.getElementById('popularServers').style.display = 'block';
	document.getElementById('addServerForm').style.display = 'none';

	editingServerName = null;

	const formTitle = document.querySelector('#addServerForm h5');
	if (formTitle) formTitle.remove();

	const saveBtn = document.querySelector('#addServerForm .btn:not(.outlined)');
	if (saveBtn) saveBtn.textContent = 'Add Server';

	document.getElementById('serverName').value = '';
	document.getElementById('serverName').disabled = false;
	document.getElementById('serverCommand').value = '';
	document.getElementById('serverUrl').value = '';
	document.getElementById('serverArgs').value = '';
	document.getElementById('serverEnv').value = '';
	document.getElementById('serverHeaders').value = '';
	document.getElementById('serverType').value = 'http';
	updateServerForm();
}

function updateServerForm() {
	const serverType = document.getElementById('serverType').value;
	const commandGroup = document.getElementById('commandGroup');
	const urlGroup = document.getElementById('urlGroup');
	const argsGroup = document.getElementById('argsGroup');
	const envGroup = document.getElementById('envGroup');
	const headersGroup = document.getElementById('headersGroup');

	if (serverType === 'stdio') {
		commandGroup.style.display = 'block';
		urlGroup.style.display = 'none';
		argsGroup.style.display = 'block';
		envGroup.style.display = 'block';
		headersGroup.style.display = 'none';
	} else if (serverType === 'http' || serverType === 'sse') {
		commandGroup.style.display = 'none';
		urlGroup.style.display = 'block';
		argsGroup.style.display = 'none';
		envGroup.style.display = 'none';
		headersGroup.style.display = 'block';
	}
}

function saveMCPServer() {
	sendStats('MCP server added');

	const name = document.getElementById('serverName').value.trim();
	const type = document.getElementById('serverType').value;

	if (!name) {
		showMCPNotification('Server name is required');
		return;
	}

	if (!editingServerName) {
		const serversList = document.getElementById('mcpServersList');
		const existingServers = serversList.querySelectorAll('.server-name');
		for (let server of existingServers) {
			if (server.textContent === name) {
				showMCPNotification('Server "' + name + '" already exists');
				return;
			}
		}
	}

	const serverConfig = { type };

	if (type === 'stdio') {
		const command = document.getElementById('serverCommand').value.trim();
		if (!command) {
			showMCPNotification('Command is required for stdio servers');
			return;
		}
		serverConfig.command = command;

		const argsText = document.getElementById('serverArgs').value.trim();
		if (argsText) {
			serverConfig.args = argsText.split('\n').filter(line => line.trim());
		}

		const envText = document.getElementById('serverEnv').value.trim();
		if (envText) {
			serverConfig.env = {};
			envText.split('\n').forEach(line => {
				const [key, ...valueParts] = line.split('=');
				if (key && valueParts.length > 0) {
					serverConfig.env[key.trim()] = valueParts.join('=').trim();
				}
			});
		}
	} else if (type === 'http' || type === 'sse') {
		const url = document.getElementById('serverUrl').value.trim();
		if (!url) {
			showMCPNotification('URL is required for HTTP/SSE servers');
			return;
		}
		serverConfig.url = url;

		const headersText = document.getElementById('serverHeaders').value.trim();
		if (headersText) {
			serverConfig.headers = {};
			headersText.split('\n').forEach(line => {
				const [key, ...valueParts] = line.split('=');
				if (key && valueParts.length > 0) {
					serverConfig.headers[key.trim()] = valueParts.join('=').trim();
				}
			});
		}
	}

	vscode.postMessage({
		type: 'saveMCPServer',
		name: name,
		config: serverConfig
	});

	hideAddServerForm();
}

function deleteMCPServer(serverName) {
	sendStats('MCP server deleted');
	vscode.postMessage({
		type: 'deleteMCPServer',
		name: serverName
	});
}

function editMCPServer(name, config) {
	sendStats('MCP server edited');

	editingServerName = name;

	document.getElementById('addServerBtn').style.display = 'none';
	document.getElementById('popularServers').style.display = 'none';
	document.getElementById('addServerForm').style.display = 'block';

	if (!document.querySelector('#addServerForm h5')) {
		document.getElementById('addServerForm').insertAdjacentHTML('afterbegin', '<h5 style="margin: 0 0 20px 0; font-size: 14px; font-weight: 600;">Edit MCP Server</h5>');
	} else {
		document.querySelector('#addServerForm h5').textContent = 'Edit MCP Server';
	}

	const saveBtn = document.querySelector('#addServerForm .btn:not(.outlined)');
	if (saveBtn) saveBtn.textContent = 'Update Server';

	document.getElementById('serverName').value = name;
	document.getElementById('serverName').disabled = true;
	document.getElementById('serverType').value = config.type || 'stdio';

	if (config.command) document.getElementById('serverCommand').value = config.command;
	if (config.url) document.getElementById('serverUrl').value = config.url;
	if (config.args && Array.isArray(config.args)) {
		document.getElementById('serverArgs').value = config.args.join('\n');
	}
	if (config.env) {
		const envLines = Object.entries(config.env).map(([key, value]) => key + '=' + value);
		document.getElementById('serverEnv').value = envLines.join('\n');
	}
	if (config.headers) {
		const headerLines = Object.entries(config.headers).map(([key, value]) => key + '=' + value);
		document.getElementById('serverHeaders').value = headerLines.join('\n');
	}

	updateServerForm();
}

function addPopularServer(name, config) {
	const serversList = document.getElementById('mcpServersList');
	const existingServers = serversList.querySelectorAll('.server-name');
	for (let server of existingServers) {
		if (server.textContent === name) {
			showMCPNotification('Server "' + name + '" already exists');
			return;
		}
	}

	sendStats('MCP server added');

	vscode.postMessage({
		type: 'saveMCPServer',
		name: name,
		config: config
	});
}

function displayMCPServers(servers) {
	const serversList = document.getElementById('mcpServersList');
	serversList.innerHTML = '';

	if (Object.keys(servers).length === 0) {
		serversList.innerHTML = '<div class="no-servers">No MCP servers configured</div>';
		return;
	}

	for (const [name, config] of Object.entries(servers)) {
		const serverItem = document.createElement('div');
		serverItem.className = 'mcp-server-item';

		if (!config || typeof config !== 'object') {
			console.error('Invalid config for server:', name, config);
			continue;
		}

		const serverType = config.type || 'stdio';
		let configDisplay = '';

		if (serverType === 'stdio') {
			configDisplay = 'Command: ' + (config.command || 'Not specified');
			if (config.args && Array.isArray(config.args)) {
				configDisplay += '<br>Args: ' + config.args.join(' ');
			}
		} else if (serverType === 'http' || serverType === 'sse') {
			configDisplay = 'URL: ' + (config.url || 'Not specified');
		} else {
			configDisplay = 'Type: ' + serverType;
		}

		serverItem.innerHTML = `
			<div class="server-info">
				<div class="server-name">${name}</div>
				<div class="server-type">${serverType.toUpperCase()}</div>
				<div class="server-config">${configDisplay}</div>
			</div>
			<div class="server-actions">
				<button class="btn outlined server-edit-btn" onclick="editMCPServer('${name}', ${JSON.stringify(config).replace(/"/g, '&quot;')})">Edit</button>
				<button class="btn outlined server-delete-btn" onclick="deleteMCPServer('${name}')">Delete</button>
			</div>
		`;

		serversList.appendChild(serverItem);
	}
}

function showMCPNotification(message) {
	const notification = document.createElement('div');
	notification.textContent = message;
	notification.style.cssText = 'position: fixed; top: 20px; right: 20px; background: var(--vscode-inputValidation-errorBackground); color: var(--vscode-inputValidation-errorForeground); padding: 8px 12px; border-radius: 4px; z-index: 9999;';
	document.body.appendChild(notification);
	setTimeout(() => notification.remove(), 3000);
}

function updateYoloWarning() {
	const yoloModeCheckbox = document.getElementById('yolo-mode');
	const warning = document.getElementById('yoloWarning');

	if (!yoloModeCheckbox || !warning) return;

	const yoloMode = yoloModeCheckbox.checked;
	warning.style.display = yoloMode ? 'block' : 'none';
}
