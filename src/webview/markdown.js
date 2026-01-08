// Markdown parsing functions

function parseSimpleMarkdown(markdown) {
	// First, handle code blocks before line-by-line processing
	let processedMarkdown = markdown;

	// Store code blocks temporarily to protect them from further processing
	const codeBlockPlaceholders = [];

	// Handle multi-line code blocks with triple backticks
	// Using RegExp constructor to avoid backtick conflicts in template literal
	const codeBlockRegex = new RegExp('\`\`\`(\\w*)\n([\\s\\S]*?)\`\`\`', 'g');
	processedMarkdown = processedMarkdown.replace(codeBlockRegex, function(match, lang, code) {
		const language = lang || 'plaintext';
		// Process code line by line to preserve formatting like diff implementation
		const codeLines = code.split('\n');
		let codeHtml = '';

		for (const line of codeLines) {
			const escapedLine = escapeHtml(line);
			codeHtml += '<div class="code-line">' + escapedLine + '</div>';
		}

		// Create unique ID for this code block
		const codeId = 'code_' + Math.random().toString(36).substr(2, 9);
		const escapedCode = escapeHtml(code);

		const codeBlockHtml = '<div class="code-block-container"><div class="code-block-header"><span class="code-block-language">' + language + '</span><button class="code-copy-btn" onclick="copyCodeBlock(\'' + codeId + '\')" title="Copy code"><svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg></button></div><pre class="code-block"><code class="language-' + language + '" id="' + codeId + '" data-raw-code="' + escapedCode.replace(/"/g, '&quot;') + '">' + codeHtml + '</code></pre></div>';

		// Store the code block and return a placeholder
		const placeholder = '__CODEBLOCK_' + codeBlockPlaceholders.length + '__';
		codeBlockPlaceholders.push(codeBlockHtml);
		return placeholder;
	});

	// Handle inline code with single backticks
	const inlineCodeRegex = new RegExp('\`([^\`]+)\`', 'g');
	processedMarkdown = processedMarkdown.replace(inlineCodeRegex, '<code>$1</code>');

	const lines = processedMarkdown.split('\n');
	let html = '';
	let inUnorderedList = false;
	let inOrderedList = false;

	for (let line of lines) {
		line = line.trim();

		// Check if this is a code block placeholder
		if (line.startsWith('__CODEBLOCK_') && line.endsWith('__')) {
			// This is a code block placeholder, don't process it
			html += line;
			continue;
		}

		// Bold
		line = line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

		// Italic - only apply when underscores are surrounded by whitespace or at beginning/end
		line = line.replace(/(?<!\*)\*(?!\*)(.*?)\*(?!\*)/g, '<em>$1</em>');
		line = line.replace(/(^|\s)_([^_\s][^_]*[^_\s]|[^_\s])_(?=\s|$)/g, '$1<em>$2</em>');

		// Headers
		if (/^####\s+/.test(line)) {
			html += '<h4>' + line.replace(/^####\s+/, '') + '</h4>';
			continue;
		} else if (/^###\s+/.test(line)) {
			html += '<h3>' + line.replace(/^###\s+/, '') + '</h3>';
			continue;
		} else if (/^##\s+/.test(line)) {
			html += '<h2>' + line.replace(/^##\s+/, '') + '</h2>';
			continue;
		} else if (/^#\s+/.test(line)) {
			html += '<h1>' + line.replace(/^#\s+/, '') + '</h1>';
			continue;
		}

		// Ordered list
		if (/^\d+\.\s+/.test(line)) {
			if (!inOrderedList) {
				html += '<ol>';
				inOrderedList = true;
			}
			const item = line.replace(/^\d+\.\s+/, '');
			html += '<li>' + item + '</li>';
			continue;
		}

		// Unordered list
		if (line.startsWith('- ')) {
			if (!inUnorderedList) {
				html += '<ul>';
				inUnorderedList = true;
			}
			html += '<li>' + line.slice(2) + '</li>';
			continue;
		}

		// Close lists
		if (inUnorderedList) {
			html += '</ul>';
			inUnorderedList = false;
		}
		if (inOrderedList) {
			html += '</ol>';
			inOrderedList = false;
		}

		// Paragraph or break
		if (line !== '') {
			html += '<p>' + line + '</p>';
		} else {
			html += '<br>';
		}
	}

	if (inUnorderedList) html += '</ul>';
	if (inOrderedList) html += '</ol>';

	// Restore code block placeholders
	for (let i = 0; i < codeBlockPlaceholders.length; i++) {
		const placeholder = '__CODEBLOCK_' + i + '__';
		html = html.replace(placeholder, codeBlockPlaceholders[i]);
	}

	return html;
}

function copyCodeBlock(codeId) {
	const codeElement = document.getElementById(codeId);
	if (codeElement) {
		const rawCode = codeElement.getAttribute('data-raw-code');
		if (rawCode) {
			// Decode HTML entities
			const decodedCode = rawCode.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
			navigator.clipboard.writeText(decodedCode).then(() => {
				// Show temporary feedback
				const copyBtn = codeElement.closest('.code-block-container').querySelector('.code-copy-btn');
				if (copyBtn) {
					const originalInnerHTML = copyBtn.innerHTML;
					copyBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>';
					copyBtn.style.color = '#4caf50';
					setTimeout(() => {
						copyBtn.innerHTML = originalInnerHTML;
						copyBtn.style.color = '';
					}, 1000);
				}
			}).catch(err => {
				console.error('Failed to copy code:', err);
			});
		}
	}
}
