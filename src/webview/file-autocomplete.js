/**
 * file-autocomplete.js - File Mention Autocomplete
 *
 * Provides inline autocomplete functionality for @ file mentions in the chat input.
 * Shows a dropdown with matching files when user types "@" followed by text.
 * Files are sorted by most recently modified.
 */

// Autocomplete state
let fileAutocompleteVisible = false;
let fileAutocompleteIndex = -1;
let filteredAutocompleteFiles = [];
let fileAutocompleteDebounceTimer = null;

/**
 * Get the file autocomplete DOM element
 */
function getFileAutocomplete() {
	return document.getElementById('fileAutocomplete');
}

/**
 * Get the file autocomplete list container
 */
function getFileAutocompleteList() {
	return document.getElementById('fileAutocompleteList');
}

/**
 * Show the file autocomplete dropdown
 */
function showFileAutocomplete(filter = '') {
	const autocomplete = getFileAutocomplete();
	const list = getFileAutocompleteList();

	if (!autocomplete || !list) {
		return;
	}

	// Request files from backend with filter
	// Debounce the request to avoid too many calls
	clearTimeout(fileAutocompleteDebounceTimer);
	fileAutocompleteDebounceTimer = setTimeout(() => {
		vscode.postMessage({
			type: 'getRecentFiles',
			searchTerm: filter
		});
	}, filter ? 100 : 0); // Immediate for initial, debounced for typing

	// Show loading state if no files yet
	if (filteredAutocompleteFiles.length === 0) {
		list.innerHTML = `
			<div class="file-autocomplete-loading">
				Loading files...
			</div>
		`;
	}

	autocomplete.style.display = 'block';
	fileAutocompleteVisible = true;
}

/**
 * Render the file autocomplete list
 */
function renderFileAutocompleteList() {
	const list = getFileAutocompleteList();
	if (!list) {
		return;
	}

	// Don't show if no matches
	if (filteredAutocompleteFiles.length === 0) {
		list.innerHTML = `
			<div class="file-autocomplete-empty">
				No matching files found
			</div>
		`;
		return;
	}

	// Render the list (limit to 10 items for performance)
	const displayFiles = filteredAutocompleteFiles.slice(0, 10);
	list.innerHTML = displayFiles.map((file, index) => `
		<div class="file-autocomplete-item${index === fileAutocompleteIndex ? ' selected' : ''}"
			 data-index="${index}"
			 data-path="${escapeHtml(file.path)}"
			 onclick="selectFileFromAutocomplete(${index})">
			<div class="file-autocomplete-icon">${getFileIcon(file.name)}</div>
			<div class="file-autocomplete-content">
				<div class="file-autocomplete-name">${escapeHtml(file.name)}</div>
				<div class="file-autocomplete-path">${escapeHtml(file.relativePath || file.path)}</div>
			</div>
		</div>
	`).join('');

	// Add hint at bottom
	list.innerHTML += `
		<div class="file-autocomplete-hint">
			<span><kbd>↑</kbd><kbd>↓</kbd> to navigate</span>
			<span><kbd>Enter</kbd> to select</span>
			<span><kbd>Esc</kbd> to close</span>
		</div>
	`;
}

/**
 * Hide the file autocomplete dropdown
 */
function hideFileAutocomplete() {
	const autocomplete = getFileAutocomplete();
	if (autocomplete) {
		autocomplete.style.display = 'none';
	}
	fileAutocompleteVisible = false;
	fileAutocompleteIndex = -1;
	filteredAutocompleteFiles = [];
	clearTimeout(fileAutocompleteDebounceTimer);
}

/**
 * Select a file from the autocomplete dropdown
 */
function selectFileFromAutocomplete(index) {
	if (index < 0 || index >= filteredAutocompleteFiles.length) {
		return;
	}

	const file = filteredAutocompleteFiles[index];
	const input = messageInput;
	const cursorPos = input.selectionStart;
	const textBefore = input.value.substring(0, cursorPos);
	const textAfter = input.value.substring(cursorPos);

	// Find the @ symbol and any partial text typed after it
	const atMatch = textBefore.match(/@(\S*)$/);
	if (!atMatch) {
		hideFileAutocomplete();
		return;
	}

	// Replace @partial with @filepath
	const beforeAt = textBefore.substring(0, textBefore.length - atMatch[0].length);
	const filePath = file.relativePath || file.path;
	const newText = beforeAt + '@' + filePath + ' ' + textAfter.trimStart();

	input.value = newText;
	input.focus();

	// Move cursor after the inserted path + space
	const newCursorPos = beforeAt.length + 1 + filePath.length + 1;
	input.setSelectionRange(newCursorPos, newCursorPos);

	hideFileAutocomplete();

	// Trigger input event to update textarea height
	input.dispatchEvent(new Event('input', { bubbles: true }));
}

/**
 * Update autocomplete selection highlight
 */
function updateFileAutocompleteSelection() {
	const list = getFileAutocompleteList();
	if (!list) {
		return;
	}

	const items = list.querySelectorAll('.file-autocomplete-item');
	items.forEach((item, index) => {
		if (index === fileAutocompleteIndex) {
			item.classList.add('selected');
			// Scroll into view if needed
			item.scrollIntoView({ block: 'nearest' });
		} else {
			item.classList.remove('selected');
		}
	});
}

/**
 * Handle file autocomplete keyboard navigation
 * Returns true if the event was handled
 */
function handleFileAutocompleteKeydown(e) {
	if (!fileAutocompleteVisible) {
		return false;
	}

	if (e.key === 'ArrowDown') {
		e.preventDefault();
		const maxIndex = Math.min(filteredAutocompleteFiles.length - 1, 9); // Max 10 items
		fileAutocompleteIndex = Math.min(fileAutocompleteIndex + 1, maxIndex);
		updateFileAutocompleteSelection();
		return true;
	}

	if (e.key === 'ArrowUp') {
		e.preventDefault();
		fileAutocompleteIndex = Math.max(fileAutocompleteIndex - 1, 0);
		updateFileAutocompleteSelection();
		return true;
	}

	if (e.key === 'Enter') {
		e.preventDefault();
		if (fileAutocompleteIndex >= 0 && fileAutocompleteIndex < filteredAutocompleteFiles.length) {
			selectFileFromAutocomplete(fileAutocompleteIndex);
		} else if (filteredAutocompleteFiles.length > 0) {
			// If no selection, select the first one
			selectFileFromAutocomplete(0);
		}
		return true;
	}

	if (e.key === 'Escape') {
		e.preventDefault();
		hideFileAutocomplete();
		return true;
	}

	if (e.key === 'Tab') {
		e.preventDefault();
		// Tab completes the first/selected file
		if (fileAutocompleteIndex >= 0 && fileAutocompleteIndex < filteredAutocompleteFiles.length) {
			selectFileFromAutocomplete(fileAutocompleteIndex);
		} else if (filteredAutocompleteFiles.length > 0) {
			selectFileFromAutocomplete(0);
		}
		return true;
	}

	return false;
}

/**
 * Check if we should show file autocomplete based on input value
 */
function checkFileAutocomplete() {
	const input = messageInput;
	const value = input.value;
	const cursorPos = input.selectionStart;

	// Get text before cursor
	const textBeforeCursor = value.substring(0, cursorPos);

	// Check if we're typing a file mention (@ followed by non-space characters)
	// The @ can appear anywhere in the text, not just at the start
	const atMatch = textBeforeCursor.match(/@(\S*)$/);

	if (atMatch) {
		const filter = atMatch[1] || '';
		fileAutocompleteIndex = filter ? 0 : -1; // Pre-select first item if filtering
		showFileAutocomplete(filter);
	} else {
		hideFileAutocomplete();
	}
}

/**
 * Update the file list from backend response
 */
function updateFileAutocompleteList(files) {
	filteredAutocompleteFiles = files || [];
	if (fileAutocompleteVisible) {
		renderFileAutocompleteList();
	}
}

/**
 * Get file icon based on extension
 */
function getFileIcon(filename) {
	const ext = filename.split('.').pop()?.toLowerCase() || '';
	const iconMap = {
		// Code files
		'js': '📜',
		'jsx': '⚛️',
		'ts': '📘',
		'tsx': '⚛️',
		'py': '🐍',
		'rb': '💎',
		'go': '🐹',
		'rs': '🦀',
		'java': '☕',
		'kt': '🎯',
		'swift': '🍎',
		'c': '⚙️',
		'cpp': '⚙️',
		'h': '📋',
		'cs': '🎮',
		'php': '🐘',
		// Web files
		'html': '🌐',
		'css': '🎨',
		'scss': '🎨',
		'less': '🎨',
		'vue': '💚',
		'svelte': '🔥',
		// Config files
		'json': '📋',
		'yaml': '📋',
		'yml': '📋',
		'toml': '📋',
		'xml': '📋',
		'env': '🔐',
		// Doc files
		'md': '📝',
		'txt': '📄',
		'pdf': '📕',
		'doc': '📘',
		'docx': '📘',
		// Data files
		'sql': '🗃️',
		'csv': '📊',
		// Shell
		'sh': '🐚',
		'bash': '🐚',
		'zsh': '🐚',
		// Images
		'png': '🖼️',
		'jpg': '🖼️',
		'jpeg': '🖼️',
		'gif': '🖼️',
		'svg': '🎭',
		'ico': '🖼️',
	};

	return iconMap[ext] || '📄';
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text) {
	const div = document.createElement('div');
	div.textContent = text;
	return div.innerHTML;
}
