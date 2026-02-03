/**
 * file-picker.js - @ File Reference Picker
 *
 * Manages the file picker modal triggered by typing "@".
 * Handles: displaying workspace files, search/filter,
 * keyboard navigation, and inserting file references into input.
 */

function showFilePicker() {
	// Request initial file list from VS Code
	vscode.postMessage({
		type: 'getWorkspaceFiles',
		searchTerm: ''
	});

	// Show modal
	filePickerModal.style.display = 'flex';
	fileSearchInput.focus();
	selectedFileIndex = -1;
}




function hideFilePicker() {
	filePickerModal.style.display = 'none';
	fileSearchInput.value = '';
	selectedFileIndex = -1;
}

function renderFileList() {
	fileList.innerHTML = '';

	filteredFiles.forEach((file, index) => {
		const fileItem = document.createElement('div');
		fileItem.className = 'file-item';
		if (index === selectedFileIndex) {
			fileItem.classList.add('selected');
		}

		fileItem.innerHTML = `
			<span class="file-icon">${getFileIcon(file.name)}</span>
			<div class="file-info">
				<div class="file-name">${file.name}</div>
				<div class="file-path">${file.path}</div>
			</div>
		`;

		fileItem.addEventListener('click', () => {
			selectFile(file);
		});

		fileList.appendChild(fileItem);
	});
}

function selectFile(file) {
	// Insert file path at cursor position
	const cursorPos = messageInput.selectionStart;
	const textBefore = messageInput.value.substring(0, cursorPos);
	const textAfter = messageInput.value.substring(cursorPos);

	// Replace the @ symbol with the file path
	const beforeAt = textBefore.substring(0, textBefore.lastIndexOf('@'));
	const newText = beforeAt + '@' + file.path + ' ' + textAfter;

	messageInput.value = newText;
	messageInput.focus();

	// Set cursor position after the inserted path
	const newCursorPos = beforeAt.length + file.path.length + 2;
	messageInput.setSelectionRange(newCursorPos, newCursorPos);

	hideFilePicker();
	adjustTextareaHeight();
}

function filterFiles(searchTerm) {
	// Send search request to backend instead of filtering locally
	vscode.postMessage({
		type: 'getWorkspaceFiles',
		searchTerm: searchTerm
	});
	selectedFileIndex = -1;
}

function selectImage() {
	// Use VS Code's native file picker instead of browser file picker
	vscode.postMessage({
		type: 'selectImageFile'
	});
}

function showImageAddedFeedback(imageName) {
	const messagesDiv = document.getElementById('messages');
	const shouldScroll = shouldAutoScroll(messagesDiv);

	const feedbackDiv = document.createElement('div');
	feedbackDiv.className = 'image-added-feedback';
	feedbackDiv.innerHTML = `
		<span class="image-added-icon">🖼️</span>
		<span class="image-added-text">Image attached: ${imageName}</span>
	`;

	messagesDiv.appendChild(feedbackDiv);

	// Auto-remove after 3 seconds
	setTimeout(() => {
		feedbackDiv.style.opacity = '0';
		setTimeout(() => feedbackDiv.remove(), 300);
	}, 3000);

	scrollToBottomIfNeeded(messagesDiv, shouldScroll);
}
