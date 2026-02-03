/**
 * diff-formatting.js - Diff Visualization & Formatting
 *
 * Formats and displays file diffs with syntax highlighting.
 * Handles: unified diff parsing, line-by-line coloring (green/red),
 * truncation for long diffs, and "Open in VS Code Diff" button.
 */

function formatToolInputUI(input) {
	if (!input || typeof input !== 'object') {
		const str = String(input);
		if (str.length > 100) {
			const truncateAt = 97;
			const truncated = str.substring(0, truncateAt);
			const inputId = 'input_' + Math.random().toString(36).substr(2, 9);

			return '<span id="' + inputId + '_visible">' + escapeHtml(truncated) + '</span>' +
				'<span id="' + inputId + '_ellipsis">...</span>' +
				'<span id="' + inputId + '_hidden" style="display: none;">' + escapeHtml(str.substring(truncateAt)) + '</span>' +
				'<div class="diff-expand-container">' +
				'<button class="diff-expand-btn" onclick="toggleResultExpansion(\'' + inputId + '\')">Show more</button>' +
				'</div>';
		}
		return str;
	}

	// Special handling for Read tool with file_path
	if (input.file_path && Object.keys(input).length === 1) {
		const formattedPath = formatFilePath(input.file_path);
		return '<div class="diff-file-path" onclick="openFileInEditor(\'' + escapeHtml(input.file_path) + '\')">' + formattedPath + '</div>';
	}

	let result = '';
	let isFirst = true;
	for (const [key, value] of Object.entries(input)) {
		const valueStr = typeof value === 'string' ? value : JSON.stringify(value, null, 2);

		if (!isFirst) { result += '\n'; }
		isFirst = false;

		// Special formatting for file_path in Read tool context
		if (key === 'file_path') {
			const formattedPath = formatFilePath(valueStr);
			result += '<div class="diff-file-path" onclick="openFileInEditor(\'' + escapeHtml(valueStr) + '\')">' + formattedPath + '</div>';
		} else if (valueStr.length > 100) {
			const truncated = valueStr.substring(0, 97) + '...';
			const escapedValue = valueStr.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
			result += '<span class="expandable-item"><strong>' + key + ':</strong> ' + truncated + ' <span class="expand-btn" data-key="' + key + '" data-value="' + escapedValue + '" onclick="toggleExpand(this)">expand</span></span>';
		} else {
			result += '<strong>' + key + ':</strong> ' + valueStr;
		}
	}
	return result;
}

function computeLineDiff(oldLines, newLines) {
	// Compute longest common subsequence
	const m = oldLines.length;
	const n = newLines.length;
	const lcs = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

	for (let i = 1; i <= m; i++) {
		for (let j = 1; j <= n; j++) {
			if (oldLines[i - 1] === newLines[j - 1]) {
				lcs[i][j] = lcs[i - 1][j - 1] + 1;
			} else {
				lcs[i][j] = Math.max(lcs[i - 1][j], lcs[i][j - 1]);
			}
		}
	}

	// Backtrack to build diff
	const diff = [];
	let i = m, j = n;

	while (i > 0 || j > 0) {
		if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
			diff.unshift({ type: 'context', oldLine: i - 1, newLine: j - 1, content: oldLines[i - 1] });
			i--;
			j--;
		} else if (j > 0 && (i === 0 || lcs[i][j - 1] >= lcs[i - 1][j])) {
			diff.unshift({ type: 'added', newLine: j - 1, content: newLines[j - 1] });
			j--;
		} else if (i > 0) {
			diff.unshift({ type: 'removed', oldLine: i - 1, content: oldLines[i - 1] });
			i--;
		}
	}

	return diff;
}

function parseToolResult(resultContent) {
	if (!resultContent || typeof resultContent !== 'string') {
		return { startLine: 1, lines: [] };
	}

	const lines = resultContent.split('\n');
	const parsed = [];
	let startLine = null;

	for (const line of lines) {
		const match = line.match(/^\s*(\d+)→(.*)$/);
		if (match) {
			const lineNum = parseInt(match[1]);
			const content = match[2];
			if (startLine === null) { startLine = lineNum; }
			parsed.push({ num: lineNum, content });
		}
	}

	return { startLine: startLine || 1, lines: parsed };
}

function generateUnifiedDiffHTML(oldString, newString, filePath, startLine = 1, showButton = false) {
	const oldLines = oldString.split('\n');
	const newLines = newString.split('\n');
	const diff = computeLineDiff(oldLines, newLines);

	// Generate unique ID for this diff (used for truncation)
	const diffId = 'diff_' + Math.random().toString(36).substr(2, 9);

	let html = '';
	const formattedPath = formatFilePath(filePath);

	// Header with file path
	html += '<div class="diff-file-header">';
	html += '<div class="diff-file-path" onclick="openFileInEditor(\'' + escapeHtml(filePath) + '\')">' + formattedPath + '</div>';
	html += '</div>\n';

	// Calculate line range
	let firstLine = startLine;
	let lastLine = startLine;
	let addedCount = 0;
	let removedCount = 0;

	// Calculate actual line numbers
	for (const change of diff) {
		if (change.type === 'added') { addedCount++; }
		if (change.type === 'removed') { removedCount++; }
	}

	lastLine = startLine + newLines.length - 1;

	html += '<div class="diff-container">';
	html += '<div class="diff-header">Lines ' + firstLine + '-' + lastLine + '</div>';

	// Build diff lines with proper line numbers
	let oldLineNum = startLine;
	let newLineNum = startLine;
	const maxLines = 6;
	let lineIndex = 0;

	// First pass: build all line HTML
	const allLinesHtml = [];
	for (const change of diff) {
		let lineNum, prefix, cssClass;

		if (change.type === 'context') {
			lineNum = newLineNum;
			prefix = ' ';
			cssClass = 'context';
			oldLineNum++;
			newLineNum++;
		} else if (change.type === 'added') {
			lineNum = newLineNum;
			prefix = '+';
			cssClass = 'added';
			newLineNum++;
		} else {
			lineNum = oldLineNum;
			prefix = '-';
			cssClass = 'removed';
			oldLineNum++;
		}

		const lineNumStr = lineNum.toString().padStart(3);
		allLinesHtml.push('<div class="diff-line ' + cssClass + '">' + prefix + lineNumStr + '  ' + escapeHtml(change.content) + '</div>');
	}

	// Show visible lines
	const shouldTruncate = allLinesHtml.length > maxLines;
	const visibleLines = shouldTruncate ? allLinesHtml.slice(0, maxLines) : allLinesHtml;
	const hiddenLines = shouldTruncate ? allLinesHtml.slice(maxLines) : [];

	html += '<div id="' + diffId + '_visible">';
	html += visibleLines.join('');
	html += '</div>';

	// Show hidden lines (initially hidden)
	if (shouldTruncate) {
		html += '<div id="' + diffId + '_hidden" style="display: none;">';
		html += hiddenLines.join('');
		html += '</div>';

		// Add expand button
		html += '<div class="diff-expand-container">';
		html += '<button class="diff-expand-btn" onclick="toggleDiffExpansion(\'' + diffId + '\')">Show ' + hiddenLines.length + ' more lines</button>';
		html += '</div>';
	}

	html += '</div>';

	// Summary
	let summary = '';
	if (addedCount > 0 && removedCount > 0) {
		summary = '+' + addedCount + ' line' + (addedCount > 1 ? 's' : '') + ' added, -' + removedCount + ' line' + (removedCount > 1 ? 's' : '') + ' removed';
	} else if (addedCount > 0) {
		summary = '+' + addedCount + ' line' + (addedCount > 1 ? 's' : '') + ' added';
	} else if (removedCount > 0) {
		summary = '-' + removedCount + ' line' + (removedCount > 1 ? 's' : '') + ' removed';
	}

	if (summary) {
		html += '<div class="diff-summary-row">';
		html += '<span class="diff-summary">Summary: ' + summary + '</span>';
		html += '<div class="diff-buttons">';
		if (showButton) {
			html += '<button class="diff-open-btn" onclick="openDiffEditor()" title="Open side-by-side diff in VS Code">';
			html += '<svg width="14" height="14" viewBox="0 0 16 16"><rect x="1" y="1" width="6" height="14" rx="1" fill="none" stroke="currentColor" stroke-opacity="0.5"/><rect x="9" y="1" width="6" height="14" rx="1" fill="none" stroke="currentColor" stroke-opacity="0.5"/><line x1="2.5" y1="4" x2="5.5" y2="4" stroke="#e8a0a0" stroke-width="1.5"/><line x1="2.5" y1="7" x2="5.5" y2="7" stroke="currentColor" stroke-opacity="0.4" stroke-width="1.5"/><line x1="2.5" y1="10" x2="5.5" y2="10" stroke="currentColor" stroke-opacity="0.4" stroke-width="1.5"/><line x1="10.5" y1="4" x2="13.5" y2="4" stroke="currentColor" stroke-opacity="0.4" stroke-width="1.5"/><line x1="10.5" y1="7" x2="13.5" y2="7" stroke="#8fd48f" stroke-width="1.5"/><line x1="10.5" y1="10" x2="13.5" y2="10" stroke="#8fd48f" stroke-width="1.5"/></svg>';
			html += 'Open Diff</button>';
		}
		html += '<button class="diff-open-btn" onclick="runFileInTerminal(\'' + escapeHtml(filePath) + '\')" title="Run file in terminal">';
		html += '<svg width="14" height="14" viewBox="0 0 16 16"><path d="M1 2v12h14V2H1zm13 11H2V3h12v10z" fill="currentColor"/><path d="M3 5l3 2-3 2V5zm4 4h5v1H7V9z" fill="currentColor"/></svg>';
		html += 'Run in Terminal</button>';
		html += '</div>';
		html += '</div>';
	}

	return html;
}

function formatEditToolDiff(input, fileContentBefore, showButton = false, providedStartLine = null) {
	if (!input || typeof input !== 'object') {
		return formatToolInputUI(input);
	}

	// Check if this is an Edit tool (has file_path, old_string, new_string)
	if (!input.file_path || !input.old_string || !input.new_string) {
		return formatToolInputUI(input);
	}

	// Use provided startLine if available (from saved data), otherwise compute from fileContentBefore
	let startLine = providedStartLine || 1;
	if (!providedStartLine && fileContentBefore) {
		const position = fileContentBefore.indexOf(input.old_string);
		if (position !== -1) {
			// Count newlines before the match to get line number
			const textBefore = fileContentBefore.substring(0, position);
			startLine = (textBefore.match(/\n/g) || []).length + 1;
		}
	}

	return generateUnifiedDiffHTML(input.old_string, input.new_string, input.file_path, startLine, showButton);
}

function formatMultiEditToolDiff(input, fileContentBefore, showButton = false, providedStartLines = null) {
	if (!input || typeof input !== 'object') {
		return formatToolInputUI(input);
	}

	// Check if this is a MultiEdit tool (has file_path and edits array)
	if (!input.file_path || !input.edits || !Array.isArray(input.edits)) {
		return formatToolInputUI(input);
	}

	// Show full diffs for each edit
	const formattedPath = formatFilePath(input.file_path);
	let html = '<div class="diff-file-header">';
	html += '<div class="diff-file-path" onclick="openFileInEditor(\'' + escapeHtml(input.file_path) + '\')">' + formattedPath + '</div>';
	html += '</div>\n';

	input.edits.forEach((edit, index) => {
		if (edit.old_string && edit.new_string) {
			if (index > 0) {
				html += '<div class="diff-edit-separator"></div>';
			}

			// Use provided startLine if available, otherwise compute from fileContentBefore
			let startLine = (providedStartLines && providedStartLines[index]) || 1;
			if (!providedStartLines && fileContentBefore) {
				const position = fileContentBefore.indexOf(edit.old_string);
				if (position !== -1) {
					const textBefore = fileContentBefore.substring(0, position);
					startLine = (textBefore.match(/\n/g) || []).length + 1;
				}
			}

			const oldLines = edit.old_string.split('\n');
			const newLines = edit.new_string.split('\n');
			const diff = computeLineDiff(oldLines, newLines);

			html += '<div class="diff-container">';
			html += '<div class="diff-header">Edit ' + (index + 1) + ' (Line ' + startLine + ')</div>';

			let lineNum = startLine;
			for (const change of diff) {
				let prefix, cssClass;
				if (change.type === 'context') {
					prefix = ' ';
					cssClass = 'context';
					lineNum++;
				} else if (change.type === 'added') {
					prefix = '+';
					cssClass = 'added';
					lineNum++;
				} else {
					prefix = '-';
					cssClass = 'removed';
				}
				const lineNumStr = (change.type === 'removed' ? '' : lineNum - 1).toString().padStart(3);
				html += '<div class="diff-line ' + cssClass + '">' + prefix + lineNumStr + '  ' + escapeHtml(change.content) + '</div>';
			}
			html += '</div>';
		}
	});

	// Add summary row with Open Diff button
	html += '<div class="diff-summary-row">';
	html += '<span class="diff-summary">Summary: ' + input.edits.length + ' edit' + (input.edits.length > 1 ? 's' : '') + '</span>';
	html += '<div class="diff-buttons">';
	if (showButton) {
		html += '<button class="diff-open-btn" onclick="openDiffEditor()" title="Open side-by-side diff in VS Code">';
		html += '<svg width="14" height="14" viewBox="0 0 16 16"><rect x="1" y="1" width="6" height="14" rx="1" fill="none" stroke="currentColor" stroke-opacity="0.5"/><rect x="9" y="1" width="6" height="14" rx="1" fill="none" stroke="currentColor" stroke-opacity="0.5"/><line x1="2.5" y1="4" x2="5.5" y2="4" stroke="#e8a0a0" stroke-width="1.5"/><line x1="2.5" y1="7" x2="5.5" y2="7" stroke="currentColor" stroke-opacity="0.4" stroke-width="1.5"/><line x1="2.5" y1="10" x2="5.5" y2="10" stroke="currentColor" stroke-opacity="0.4" stroke-width="1.5"/><line x1="10.5" y1="4" x2="13.5" y2="4" stroke="currentColor" stroke-opacity="0.4" stroke-width="1.5"/><line x1="10.5" y1="7" x2="13.5" y2="7" stroke="#8fd48f" stroke-width="1.5"/><line x1="10.5" y1="10" x2="13.5" y2="10" stroke="#8fd48f" stroke-width="1.5"/></svg>';
		html += 'Open Diff</button>';
	}
	html += '<button class="diff-open-btn" onclick="runFileInTerminal(\'' + escapeHtml(input.file_path) + '\')" title="Run file in terminal">';
	html += '<svg width="14" height="14" viewBox="0 0 16 16"><path d="M1 2v12h14V2H1zm13 11H2V3h12v10z" fill="currentColor"/><path d="M3 5l3 2-3 2V5zm4 4h5v1H7V9z" fill="currentColor"/></svg>';
	html += 'Run in Terminal</button>';
	html += '</div>';
	html += '</div>';

	return html;
}

function formatWriteToolDiff(input, fileContentBefore, showButton = false) {
	if (!input || typeof input !== 'object') {
		return formatToolInputUI(input);
	}

	// Check if this is a Write tool (has file_path and content)
	if (!input.file_path || !input.content) {
		return formatToolInputUI(input);
	}

	// fileContentBefore may be empty string if new file, or existing content if overwriting
	const fullFileBefore = fileContentBefore || '';

	// Show full content as added lines (new file or replacement)
	return generateUnifiedDiffHTML(fullFileBefore, input.content, input.file_path, 1, showButton);
}
