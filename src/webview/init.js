// Initialization - Entry point for the webview
// All modules are loaded before this file

// Request initial data from extension
vscode.postMessage({ type: 'ready' });

// Request custom snippets on page load
vscode.postMessage({ type: 'getCustomSnippets' });

// Request platform info for WSL alert
vscode.postMessage({ type: 'getPlatformInfo' });

// Set initial state
updateStatus('Initializing...', 'disconnected');
