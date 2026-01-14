/**
 * utils.js - General Utility Functions
 *
 * Shared utility functions for the webview.
 * Handles: HTML escaping, file path formatting,
 * file icon selection, and file opening in editor.
 */

function escapeHtml(text) {
	const div = document.createElement('div');
	div.textContent = text;
	return div.innerHTML;
}

function formatFilePath(filePath) {
	if (!filePath) return '';

	// Extract just the filename
	const parts = filePath.split('/');
	const fileName = parts[parts.length - 1];

	return '<span class="file-path-truncated" title="' + escapeHtml(filePath) + '" data-file-path="' + escapeHtml(filePath) + '">' +
		   '<span class="file-icon">📄</span>' + escapeHtml(fileName) + '</span>';
}

function getFileIcon(filename) {
	const ext = filename.split('.').pop()?.toLowerCase();
	switch (ext) {
		case 'js': case 'jsx': case 'ts': case 'tsx': return '📄';
		case 'html': case 'htm': return '🌐';
		case 'css': case 'scss': case 'sass': return '🎨';
		case 'json': return '📋';
		case 'md': return '📝';
		case 'py': return '🐍';
		case 'java': return '☕';
		case 'cpp': case 'c': case 'h': return '⚙️';
		case 'png': case 'jpg': case 'jpeg': case 'gif': case 'svg': return '🖼️';
		case 'pdf': return '📄';
		case 'zip': case 'tar': case 'gz': return '📦';
		default: return '📄';
	}
}

function openFileInEditor(filePath) {
	vscode.postMessage({
		type: 'openFile',
		filePath: filePath
	});
}
