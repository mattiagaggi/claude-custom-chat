/**
 * tool-display.js - Tool Execution Display
 *
 * Renders tool use and tool result messages in the chat.
 * Handles: displaying tool names, inputs, outputs, and status.
 * Groups consecutive same-tool executions for cleaner display.
 */

// Track consecutive tool uses of same type
let lastToolUseName = null;
let lastToolUseCount = 0;

// Reset tool tracking when non-tool content is added
function resetToolTracking() {
	lastToolUseName = null;
	lastToolUseCount = 0;
}

function addToolUseMessage(data) {
	const messagesDiv = document.getElementById('messages');
	const shouldScroll = shouldAutoScroll(messagesDiv);

	let toolName = data.toolInfo.replace('🔧 Executing: ', '');
	// Replace TodoWrite with more user-friendly name
	if (toolName === 'TodoWrite') {
		toolName = 'Update Todos';
	}

	// Check if this is the same tool type as the last one
	if (lastToolUseName === toolName) {
		lastToolUseCount++;

		// Find and update the last tool message instead of creating new one
		const toolMessages = messagesDiv.querySelectorAll('.message.tool');
		const lastToolMessage = toolMessages[toolMessages.length - 1];

		if (lastToolMessage && lastToolMessage.dataset.toolName === toolName) {
			// Update the count badge
			const toolInfoElement = lastToolMessage.querySelector('.tool-info');
			if (toolInfoElement) {
				// Update or add count badge
				let countBadge = toolInfoElement.querySelector('.tool-count-badge');
				if (!countBadge) {
					countBadge = document.createElement('span');
					countBadge.className = 'tool-count-badge';
					toolInfoElement.appendChild(countBadge);
				}
				countBadge.textContent = ' ' + lastToolUseCount;
			}

			// Update the tool input content with latest
			const inputContent = lastToolMessage.querySelector('.tool-input-content');
			if (inputContent && data.rawInput) {
				if (data.toolName === 'TodoWrite' && data.rawInput.todos) {
					let todoHtml = 'Todo List Update:';
					for (const todo of data.rawInput.todos) {
						const status = todo.status === 'completed' ? '✅' :
							todo.status === 'in_progress' ? '🔄' : '⏳';
						todoHtml += '\n' + status + ' ' + todo.content;
					}
					inputContent.innerHTML = todoHtml;
				} else if (data.toolName === 'Edit' || data.toolName === 'MultiEdit' || data.toolName === 'Write') {
					// Keep edit/write tools showing their diffs
				} else {
					inputContent.innerHTML = formatToolInputUI(data.rawInput);
				}
			}

			scrollToBottomIfNeeded(messagesDiv, shouldScroll);
			return;
		}
	}

	// Different tool type or first tool - reset counter
	lastToolUseName = toolName;
	lastToolUseCount = 1;

	const messageDiv = document.createElement('div');
	messageDiv.className = 'message tool';
	messageDiv.dataset.toolName = toolName;

	// Create modern header with icon
	const headerDiv = document.createElement('div');
	headerDiv.className = 'tool-header';

	const iconDiv = document.createElement('div');
	iconDiv.className = 'tool-icon';
	iconDiv.textContent = '🔧';

	const toolInfoElement = document.createElement('div');
	toolInfoElement.className = 'tool-info';
	toolInfoElement.textContent = toolName;

	headerDiv.appendChild(iconDiv);
	headerDiv.appendChild(toolInfoElement);
	messageDiv.appendChild(headerDiv);

	if (data.rawInput) {
		const inputElement = document.createElement('div');
		inputElement.className = 'tool-input';

		const contentDiv = document.createElement('div');
		contentDiv.className = 'tool-input-content';

		// Handle TodoWrite specially or format raw input
		if (data.toolName === 'TodoWrite' && data.rawInput.todos) {
			let todoHtml = 'Todo List Update:';
			for (const todo of data.rawInput.todos) {
				const status = todo.status === 'completed' ? '✅' :
					todo.status === 'in_progress' ? '🔄' : '⏳';
				todoHtml += '\n' + status + ' ' + todo.content;
			}
			contentDiv.innerHTML = todoHtml;
		} else {
			// Format raw input with expandable content for long values
			// Use diff format for Edit, MultiEdit, and Write tools, regular format for others
			if (data.toolName === 'Edit' || data.toolName === 'MultiEdit' || data.toolName === 'Write') {
				// Only show Open Diff button if we have fileContentBefore (live session, not reload)
				const showButton = data.fileContentBefore !== undefined && data.messageIndex >= 0;

				// Hide any existing pending edit button before showing new one
				if (showButton && lastPendingEditIndex >= 0) {
					const prevContent = document.querySelector('[data-edit-message-index="' + lastPendingEditIndex + '"]');
					if (prevContent) {
						const btn = prevContent.querySelector('.diff-open-btn');
						if (btn) btn.style.display = 'none';
					}
					lastPendingEditData = null;
				}

				if (showButton) {
					lastPendingEditIndex = data.messageIndex;
					contentDiv.setAttribute('data-edit-message-index', data.messageIndex);

					// Compute and store diff data for when button is clicked
					const oldContent = data.fileContentBefore || '';
					let newContent = oldContent;
					if (data.toolName === 'Edit' && data.rawInput.old_string && data.rawInput.new_string) {
						newContent = oldContent.replace(data.rawInput.old_string, data.rawInput.new_string);
					} else if (data.toolName === 'MultiEdit' && data.rawInput.edits) {
						for (const edit of data.rawInput.edits) {
							if (edit.old_string && edit.new_string) {
								newContent = newContent.replace(edit.old_string, edit.new_string);
							}
						}
					} else if (data.toolName === 'Write' && data.rawInput.content) {
						newContent = data.rawInput.content;
					}
					lastPendingEditData = {
						filePath: data.rawInput.file_path,
						oldContent: oldContent,
						newContent: newContent
					};
				}

				if (data.toolName === 'Edit') {
					contentDiv.innerHTML = formatEditToolDiff(data.rawInput, data.fileContentBefore, showButton, data.startLine);
				} else if (data.toolName === 'MultiEdit') {
					contentDiv.innerHTML = formatMultiEditToolDiff(data.rawInput, data.fileContentBefore, showButton, data.startLines);
				} else {
					contentDiv.innerHTML = formatWriteToolDiff(data.rawInput, data.fileContentBefore, showButton);
				}
			} else {
				contentDiv.innerHTML = formatToolInputUI(data.rawInput);
			}
		}

		inputElement.appendChild(contentDiv);
		messageDiv.appendChild(inputElement);
	} else if (data.toolInput) {
		// Fallback for pre-formatted input
		const inputElement = document.createElement('div');
		inputElement.className = 'tool-input';

		const labelDiv = document.createElement('div');
		labelDiv.className = 'tool-input-label';
		labelDiv.textContent = 'INPUT';
		inputElement.appendChild(labelDiv);

		const contentDiv = document.createElement('div');
		contentDiv.className = 'tool-input-content';
		contentDiv.textContent = data.toolInput;
		inputElement.appendChild(contentDiv);
		messageDiv.appendChild(inputElement);
	}

	messagesDiv.appendChild(messageDiv);
	moveProcessingIndicatorToLast();
	scrollToBottomIfNeeded(messagesDiv, shouldScroll);
}

function addToolResultMessage(data) {
	const messagesDiv = document.getElementById('messages');
	const shouldScroll = shouldAutoScroll(messagesDiv);

	// When result comes in for Edit/MultiEdit/Write, hide the Open Diff button on the request
	// since the edit has now been applied (no longer pending)
	if (lastPendingEditIndex >= 0) {
		// Find and hide the button on the corresponding toolUse
		const toolUseContent = document.querySelector('[data-edit-message-index="' + lastPendingEditIndex + '"]');
		if (toolUseContent) {
			const btn = toolUseContent.querySelector('.diff-open-btn');
			if (btn) {
				btn.style.display = 'none';
			}
		}
		lastPendingEditIndex = -1;
		lastPendingEditData = null;
	}

	// For Read and TodoWrite tools, just hide loading state (no result message needed)
	if ((data.toolName === 'Read' || data.toolName === 'TodoWrite') && !data.isError) {
		return;
	}

	// For Edit/MultiEdit/Write, show simple completion message (diff is already shown on request)
	if ((data.toolName === 'Edit' || data.toolName === 'MultiEdit' || data.toolName === 'Write') && !data.isError) {
		let completionText;
		if (data.toolName === 'Edit') {
			completionText = '✅ Edit completed';
		} else if (data.toolName === 'MultiEdit') {
			completionText = '✅ MultiEdit completed';
		} else {
			completionText = '✅ Write completed';
		}
		addMessage(completionText, 'system');
		scrollToBottomIfNeeded(messagesDiv, shouldScroll);
		return;
	}

	if(data.isError && data.content?.includes("File has not been read yet. Read it first before writing to it.")){
		return addMessage("File has not been read yet. Let me read it first before writing to it.", 'system');
	}

	const messageDiv = document.createElement('div');
	messageDiv.className = data.isError ? 'message error' : 'message tool-result';

	// Create header
	const headerDiv = document.createElement('div');
	headerDiv.className = 'message-header';

	const iconDiv = document.createElement('div');
	iconDiv.className = data.isError ? 'message-icon error' : 'message-icon';
	iconDiv.style.background = data.isError ?
		'linear-gradient(135deg, #e74c3c 0%, #c0392b 100%)' :
		'linear-gradient(135deg, #1cc08c 0%, #16a974 100%)';
	iconDiv.textContent = data.isError ? '❌' : '✅';

	const labelDiv = document.createElement('div');
	labelDiv.className = 'message-label';
	labelDiv.textContent = data.isError ? 'Error' : 'Result';

	headerDiv.appendChild(iconDiv);
	headerDiv.appendChild(labelDiv);
	messageDiv.appendChild(headerDiv);

	// Add content
	const contentDiv = document.createElement('div');
	contentDiv.className = 'message-content';

	// Check if it's a tool result and truncate appropriately
	let content = data.content;

	// Clean up error messages by removing XML-like tags
	if (data.isError && content) {
		content = content.replace(/<tool_use_error>/g, '').replace(/<\/tool_use_error>/g, '').trim();
	}
	if (content.length > 200 && !data.isError) {
		const truncateAt = 197;
		const truncated = content.substring(0, truncateAt);
		const resultId = 'result_' + Math.random().toString(36).substr(2, 9);

		const preElement = document.createElement('pre');
		preElement.innerHTML = '<span id="' + resultId + '_visible">' + escapeHtml(truncated) + '</span>' +
							   '<span id="' + resultId + '_ellipsis">...</span>' +
							   '<span id="' + resultId + '_hidden" style="display: none;">' + escapeHtml(content.substring(truncateAt)) + '</span>';
		contentDiv.appendChild(preElement);

		// Add expand button container
		const expandContainer = document.createElement('div');
		expandContainer.className = 'diff-expand-container';
		const expandButton = document.createElement('button');
		expandButton.className = 'diff-expand-btn';
		expandButton.textContent = 'Show more';
		expandButton.setAttribute('onclick', 'toggleResultExpansion(\'' + resultId + '\')');
		expandContainer.appendChild(expandButton);
		contentDiv.appendChild(expandContainer);
	} else {
		const preElement = document.createElement('pre');
		preElement.textContent = content;
		contentDiv.appendChild(preElement);
	}

	messageDiv.appendChild(contentDiv);

	// Check if this is a permission-related error and add yolo mode button
	if (data.isError && isPermissionError(content)) {
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
	moveProcessingIndicatorToLast();
	scrollToBottomIfNeeded(messagesDiv, shouldScroll);
}
