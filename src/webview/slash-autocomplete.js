/**
 * slash-autocomplete.js - Slash Command Autocomplete
 *
 * Provides autocomplete functionality for slash commands in the chat input.
 * Shows a dropdown with matching commands when user types "/" followed by text.
 */

// Available slash commands with icons and descriptions
const slashCommands = [
	// Built-in commands (run in chat)
	{ name: 'help', icon: '❓', description: 'Get usage help', category: 'cli' },
	{ name: 'doctor', icon: '🩺', description: 'Check installation health', category: 'cli' },
	{ name: 'config', icon: '⚙️', description: 'Open settings interface', category: 'cli' },
	{ name: 'status', icon: '📊', description: 'Show version, model, account info', category: 'cli' },
	{ name: 'model', icon: '🤖', description: 'Select or change the AI model', category: 'cli' },
	{ name: 'mcp', icon: '🔌', description: 'Manage MCP server connections', category: 'cli' },
	{ name: 'permissions', icon: '🔒', description: 'View or update permissions', category: 'cli' },
	{ name: 'agents', icon: '🤖', description: 'Manage custom AI subagents', category: 'cli' },

	// Extension commands
	{ name: 'clear', icon: '🗑️', description: 'Clear conversation history', category: 'extension' },
	{ name: 'cost', icon: '💰', description: 'Show token usage statistics', category: 'extension' },
	{ name: 'usage', icon: '📈', description: 'Show plan usage limits', category: 'extension' },

	// Terminal commands
	{ name: 'init', icon: '🚀', description: 'Initialize project with CLAUDE.md', category: 'terminal' },
	{ name: 'login', icon: '🔑', description: 'Switch Anthropic accounts', category: 'terminal' },
	{ name: 'logout', icon: '🚪', description: 'Sign out from your account', category: 'terminal' },
	{ name: 'terminal-setup', icon: '⌨️', description: 'Install Shift+Enter key binding', category: 'terminal' },
	{ name: 'vim', icon: '📝', description: 'Enter vim mode', category: 'terminal' },

	// Prompt commands (send to Claude)
	{ name: 'bug', icon: '🐛', description: 'Report bugs to Anthropic', category: 'prompt' },
	{ name: 'compact', icon: '📦', description: 'Compact conversation', category: 'prompt' },
	{ name: 'memory', icon: '🧠', description: 'Edit CLAUDE.md memory files', category: 'prompt' },
	{ name: 'add-dir', icon: '📁', description: 'Add additional working directories', category: 'prompt' },
	{ name: 'pr_comments', icon: '💬', description: 'View pull request comments', category: 'prompt' },
	{ name: 'review', icon: '👀', description: 'Request code review', category: 'prompt' },
	{ name: 'rewind', icon: '⏪', description: 'Rewind conversation and/or code', category: 'prompt' },

	// Prompt snippets
	{ name: 'performance-analysis', icon: '⚡', description: 'Analyze code for performance issues', category: 'snippet' },
	{ name: 'security-review', icon: '🔒', description: 'Review code for security vulnerabilities', category: 'snippet' },
	{ name: 'implementation-review', icon: '🔍', description: 'Review the implementation', category: 'snippet' },
	{ name: 'code-explanation', icon: '📖', description: 'Explain how code works', category: 'snippet' },
	{ name: 'bug-fix', icon: '🐛', description: 'Help fix a bug', category: 'snippet' },
	{ name: 'refactor', icon: '🔄', description: 'Refactor code for readability', category: 'snippet' },
	{ name: 'test-generation', icon: '🧪', description: 'Generate comprehensive tests', category: 'snippet' },
	{ name: 'documentation', icon: '📝', description: 'Generate documentation', category: 'snippet' },
];

// Autocomplete state
let slashAutocompleteVisible = false;
let slashAutocompleteIndex = -1;
let filteredSlashCommands = [];

/**
 * Get the slash autocomplete DOM element
 */
function getSlashAutocomplete() {
	return document.getElementById('slashAutocomplete');
}

/**
 * Get the slash autocomplete list container
 */
function getSlashAutocompleteList() {
	return document.getElementById('slashAutocompleteList');
}

/**
 * Show the slash command autocomplete dropdown
 */
function showSlashAutocomplete(filter = '') {
	const autocomplete = getSlashAutocomplete();
	const list = getSlashAutocompleteList();

	if (!autocomplete || !list) return;

	// Filter commands based on input
	const searchTerm = filter.toLowerCase();
	filteredSlashCommands = slashCommands.filter(cmd =>
		cmd.name.toLowerCase().includes(searchTerm) ||
		cmd.description.toLowerCase().includes(searchTerm)
	);

	// Don't show if no matches
	if (filteredSlashCommands.length === 0) {
		hideSlashAutocomplete();
		return;
	}

	// Render the list
	list.innerHTML = filteredSlashCommands.map((cmd, index) => `
		<div class="slash-autocomplete-item${index === slashAutocompleteIndex ? ' selected' : ''}"
			 data-index="${index}"
			 data-command="${cmd.name}"
			 onclick="selectSlashCommand('${cmd.name}')">
			<div class="slash-autocomplete-icon">${cmd.icon}</div>
			<div class="slash-autocomplete-content">
				<div class="slash-autocomplete-name">/${cmd.name}</div>
				<div class="slash-autocomplete-desc">${cmd.description}</div>
			</div>
		</div>
	`).join('');

	// Add hint at bottom
	list.innerHTML += `
		<div class="slash-autocomplete-hint">
			<span><kbd>↑</kbd><kbd>↓</kbd> to navigate</span>
			<span><kbd>Enter</kbd> to select</span>
			<span><kbd>Esc</kbd> to close</span>
		</div>
	`;

	autocomplete.style.display = 'block';
	slashAutocompleteVisible = true;
}

/**
 * Hide the slash command autocomplete dropdown
 */
function hideSlashAutocomplete() {
	const autocomplete = getSlashAutocomplete();
	if (autocomplete) {
		autocomplete.style.display = 'none';
	}
	slashAutocompleteVisible = false;
	slashAutocompleteIndex = -1;
	filteredSlashCommands = [];
}

/**
 * Select a slash command from the autocomplete
 */
function selectSlashCommand(commandName) {
	const input = messageInput;

	// Replace the current input with the selected command
	input.value = '/' + commandName + ' ';
	input.focus();

	// Move cursor to end
	input.setSelectionRange(input.value.length, input.value.length);

	hideSlashAutocomplete();

	// Trigger input event to update textarea height
	input.dispatchEvent(new Event('input', { bubbles: true }));
}

/**
 * Update autocomplete selection
 */
function updateSlashAutocompleteSelection() {
	const list = getSlashAutocompleteList();
	if (!list) return;

	const items = list.querySelectorAll('.slash-autocomplete-item');
	items.forEach((item, index) => {
		if (index === slashAutocompleteIndex) {
			item.classList.add('selected');
			// Scroll into view if needed
			item.scrollIntoView({ block: 'nearest' });
		} else {
			item.classList.remove('selected');
		}
	});
}

/**
 * Handle slash autocomplete keyboard navigation
 * Returns true if the event was handled
 */
function handleSlashAutocompleteKeydown(e) {
	if (!slashAutocompleteVisible) return false;

	if (e.key === 'ArrowDown') {
		e.preventDefault();
		slashAutocompleteIndex = Math.min(slashAutocompleteIndex + 1, filteredSlashCommands.length - 1);
		updateSlashAutocompleteSelection();
		return true;
	}

	if (e.key === 'ArrowUp') {
		e.preventDefault();
		slashAutocompleteIndex = Math.max(slashAutocompleteIndex - 1, 0);
		updateSlashAutocompleteSelection();
		return true;
	}

	if (e.key === 'Enter') {
		e.preventDefault();
		if (slashAutocompleteIndex >= 0 && slashAutocompleteIndex < filteredSlashCommands.length) {
			selectSlashCommand(filteredSlashCommands[slashAutocompleteIndex].name);
		} else if (filteredSlashCommands.length > 0) {
			// If no selection, select the first one
			selectSlashCommand(filteredSlashCommands[0].name);
		}
		return true;
	}

	if (e.key === 'Escape') {
		e.preventDefault();
		hideSlashAutocomplete();
		return true;
	}

	if (e.key === 'Tab') {
		e.preventDefault();
		// Tab completes the first/selected command
		if (slashAutocompleteIndex >= 0 && slashAutocompleteIndex < filteredSlashCommands.length) {
			selectSlashCommand(filteredSlashCommands[slashAutocompleteIndex].name);
		} else if (filteredSlashCommands.length > 0) {
			selectSlashCommand(filteredSlashCommands[0].name);
		}
		return true;
	}

	return false;
}

/**
 * Check if we should show slash autocomplete based on input value
 */
function checkSlashAutocomplete() {
	const input = messageInput;
	const value = input.value;
	const cursorPos = input.selectionStart;

	// Get text before cursor
	const textBeforeCursor = value.substring(0, cursorPos);

	// Check if we're typing a slash command (starts with / and no space before it)
	const slashMatch = textBeforeCursor.match(/^\/(\S*)$/);

	if (slashMatch) {
		const filter = slashMatch[1] || '';
		slashAutocompleteIndex = filter ? 0 : -1; // Pre-select first item if filtering
		showSlashAutocomplete(filter);
	} else {
		hideSlashAutocomplete();
	}
}
