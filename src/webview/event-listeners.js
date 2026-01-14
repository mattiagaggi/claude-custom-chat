/**
 * event-listeners.js - DOM Event Binding
 *
 * Sets up all DOM event listeners for user interactions.
 * Handles: textarea input/resize, keyboard shortcuts (Enter, @, /),
 * button clicks, drag-and-drop, paste events, and scroll behavior.
 */

// Auto-resize textarea on input
messageInput.addEventListener('input', adjustTextareaHeight);

// Save input text as user types (debounced)
let saveInputTimeout;
messageInput.addEventListener('input', () => {
	clearTimeout(saveInputTimeout);
	saveInputTimeout = setTimeout(() => {
		vscode.postMessage({
			type: 'saveInputText',
			text: messageInput.value
		});
	}, 500);
});

// Keyboard shortcuts
messageInput.addEventListener('keydown', (e) => {
	// Handle slash autocomplete keyboard navigation first
	if (handleSlashAutocompleteKeydown(e)) {
		return;
	}

	// Handle file autocomplete keyboard navigation
	if (handleFileAutocompleteKeydown(e)) {
		return;
	}

	if (e.key === 'Enter' && !e.shiftKey) {
		e.preventDefault();
		hideSlashAutocomplete();
		hideFileAutocomplete();
		const sendBtn = document.getElementById('sendBtn');
		if (sendBtn.disabled) return;
		sendMessage();
	} else if (e.key === 'Escape') {
		if (slashAutocompleteVisible) {
			e.preventDefault();
			hideSlashAutocomplete();
		} else if (fileAutocompleteVisible) {
			e.preventDefault();
			hideFileAutocomplete();
		} else if (filePickerModal.style.display === 'flex') {
			e.preventDefault();
			hideFilePicker();
		}
	} else if (e.key === 'v' && (e.ctrlKey || e.metaKey)) {
		setTimeout(() => {
			const currentValue = messageInput.value;
			setTimeout(() => {
				if (messageInput.value === currentValue) {
					vscode.postMessage({ type: 'getClipboardText' });
				}
			}, 50);
		}, 0);
	}
});

// Paste handler with image support
messageInput.addEventListener('paste', async (e) => {
	e.preventDefault();

	try {
		const clipboardData = e.clipboardData;

		// Check for images first
		if (clipboardData && clipboardData.items) {
			let hasImage = false;
			for (let i = 0; i < clipboardData.items.length; i++) {
				const item = clipboardData.items[i];
				if (item.type.startsWith('image/')) {
					hasImage = true;
					const blob = item.getAsFile();
					if (blob) {
						const reader = new FileReader();
						reader.onload = function(event) {
							const base64Data = event.target.result;
							vscode.postMessage({
								type: 'createImageFile',
								imageData: base64Data,
								imageType: item.type
							});
						};
						reader.readAsDataURL(blob);
					}
					break;
				}
			}

			if (hasImage) return;
		}

		// Handle text
		let text = '';

		if (clipboardData) {
			text = clipboardData.getData('text/plain');
		}

		if (!text && navigator.clipboard && navigator.clipboard.readText) {
			try {
				text = await navigator.clipboard.readText();
			} catch (err) {
				// Clipboard API failed
			}
		}

		if (!text) {
			vscode.postMessage({ type: 'getClipboardText' });
			return;
		}

		// Insert text at cursor position
		const start = messageInput.selectionStart;
		const end = messageInput.selectionEnd;
		const currentValue = messageInput.value;

		const newValue = currentValue.substring(0, start) + text + currentValue.substring(end);
		messageInput.value = newValue;

		const newCursorPos = start + text.length;
		messageInput.setSelectionRange(newCursorPos, newCursorPos);

		messageInput.dispatchEvent(new Event('input', { bubbles: true }));
	} catch (error) {
		console.error('Paste error:', error);
	}
});

// Context menu handler
messageInput.addEventListener('contextmenu', (e) => {
	vscode.postMessage({
		type: 'contextMenu',
		x: e.clientX,
		y: e.clientY
	});
});

// File picker search
fileSearchInput.addEventListener('input', (e) => {
	filterFiles(e.target.value);
});

// File picker keyboard navigation
fileSearchInput.addEventListener('keydown', (e) => {
	if (e.key === 'ArrowDown') {
		e.preventDefault();
		selectedFileIndex = Math.min(selectedFileIndex + 1, filteredFiles.length - 1);
		renderFileList();
	} else if (e.key === 'ArrowUp') {
		e.preventDefault();
		selectedFileIndex = Math.max(selectedFileIndex - 1, -1);
		renderFileList();
	} else if (e.key === 'Enter') {
		e.preventDefault();
		if (selectedFileIndex >= 0) {
			// Select from filtered list
			selectFile(filteredFiles[selectedFileIndex]);
		} else if (fileSearchInput.value.trim()) {
			// Treat as direct path input
			selectFile({ path: fileSearchInput.value.trim(), name: fileSearchInput.value.trim() });
		}
	} else if (e.key === 'Escape') {
		e.preventDefault();
		hideFilePicker();
	}
});

// Modal close on background click
filePickerModal.addEventListener('click', (e) => {
	if (e.target === filePickerModal) {
		hideFilePicker();
	}
});

document.getElementById('mcpModal').addEventListener('click', (e) => {
	if (e.target === document.getElementById('mcpModal')) {
		hideMCPModal();
	}
});

document.getElementById('modelModal').addEventListener('click', (e) => {
	if (e.target === document.getElementById('modelModal')) {
		hideModelModal();
	}
});

document.getElementById('settingsModal').addEventListener('click', (e) => {
	if (e.target === document.getElementById('settingsModal')) {
		hideSettingsModal();
	}
});

document.getElementById('thinkingIntensityModal').addEventListener('click', (e) => {
	if (e.target === document.getElementById('thinkingIntensityModal')) {
		hideThinkingIntensityModal();
	}
});

document.getElementById('slashCommandsModal').addEventListener('click', (e) => {
	if (e.target === document.getElementById('slashCommandsModal')) {
		hideSlashCommandsModal();
	}
});

// Close permission menus when clicking outside
document.addEventListener('click', function(event) {
	if (!event.target.closest('.permission-menu')) {
		document.querySelectorAll('.permission-menu-dropdown').forEach(dropdown => {
			dropdown.style.display = 'none';
		});
	}
});

// Slash command autocomplete - show dropdown when typing /
messageInput.addEventListener('input', () => {
	checkSlashAutocomplete();
	checkFileAutocomplete();
});

// Hide autocomplete when input loses focus (with delay to allow click on items)
messageInput.addEventListener('blur', () => {
	setTimeout(() => {
		hideSlashAutocomplete();
		hideFileAutocomplete();
	}, 200);
});

// WSL options visibility
document.getElementById('wsl-enabled').addEventListener('change', function() {
	document.getElementById('wslOptions').style.display = this.checked ? 'block' : 'none';
});

// YOLO mode warning
document.getElementById('yolo-mode').addEventListener('change', updateYoloWarning);
