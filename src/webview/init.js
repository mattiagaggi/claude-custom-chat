/**
 * init.js - Webview Initialization
 *
 * Entry point that runs after all other modules are loaded.
 * Sends initial requests to the extension for data (ready, settings, platform info).
 * All modules are loaded before this file executes.
 */

// Request initial data from extension
vscode.postMessage({ type: 'ready' });

// Request custom snippets on page load
vscode.postMessage({ type: 'getCustomSnippets' });

// Request platform info for WSL alert
vscode.postMessage({ type: 'getPlatformInfo' });

// Initialize conversation tabs
initializeConversationTabs();

// Set initial state
updateStatus('Initializing...', 'disconnected');
