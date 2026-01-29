/**
 * VSCodeUtilities.ts - VS Code API Wrappers
 *
 * Provides utility functions for common VS Code operations:
 * - Opening diff views (side-by-side file comparisons)
 * - Opening files in the editor
 * - Image selection and clipboard handling
 * - Terminal operations for slash commands
 * - Settings management
 */

import * as vscode from 'vscode';
import * as path from 'path';

// Diff content storage for read-only diff views
const diffContentStore = new Map<string, string>();

/**
 * Provider for diff content
 */
export class DiffContentProvider implements vscode.TextDocumentContentProvider {
	provideTextDocumentContent(uri: vscode.Uri): string {
		return diffContentStore.get(uri.path) || '';
	}
}

/**
 * Open a diff view comparing old and new content
 */
export function openDiff(filePath: string, oldContent: string, newContent: string): void {
	const fileName = path.basename(filePath);
	diffContentStore.set(`${filePath}?old`, oldContent);
	diffContentStore.set(`${filePath}?new`, newContent);

	const leftUri = vscode.Uri.parse(`claude-diff:${filePath}?old`);
	const rightUri = vscode.Uri.parse(`claude-diff:${filePath}?new`);

	vscode.commands.executeCommand('vscode.diff', leftUri, rightUri, `${fileName} (Claude's changes)`);
}

/**
 * Open a file in the editor
 */
export async function openFile(filePath: string): Promise<void> {
	const workspaceFolder = vscode.workspace.workspaceFolders?.[0];

	// Try the path as-is first (works for valid absolute local paths)
	let uri = filePath.startsWith('/') || /^[a-zA-Z]:/.test(filePath)
		? vscode.Uri.file(filePath)
		: workspaceFolder
			? vscode.Uri.joinPath(workspaceFolder.uri, filePath)
			: vscode.Uri.file(filePath);

	try {
		await vscode.workspace.fs.stat(uri);
		await vscode.window.showTextDocument(uri, { viewColumn: vscode.ViewColumn.One, preserveFocus: false });
		return;
	} catch {
		// File not found at that path — try resolving as a container/relative path
	}

	if (workspaceFolder) {
		// Strip common container prefixes (e.g. /app/, /src/, /workspace/, /home/user/project/)
		// and try resolving the remainder against the workspace
		const stripped = filePath.replace(/^\/(?:app|src|workspace|project|code)\//, '');
		if (stripped !== filePath) {
			const resolvedUri = vscode.Uri.joinPath(workspaceFolder.uri, stripped);
			try {
				await vscode.workspace.fs.stat(resolvedUri);
				await vscode.window.showTextDocument(resolvedUri, { viewColumn: vscode.ViewColumn.One, preserveFocus: false });
				return;
			} catch {
				// Still not found
			}
		}

		// Last resort: try just the filename in the workspace
		const fileName = filePath.split('/').pop();
		if (fileName) {
			const found = await vscode.workspace.findFiles(`**/${fileName}`, '**/node_modules/**', 1);
			if (found.length > 0) {
				await vscode.window.showTextDocument(found[0], { viewColumn: vscode.ViewColumn.One, preserveFocus: false });
				return;
			}
		}
	}

	vscode.window.showErrorMessage(`File not found: ${filePath}`);
}

/**
 * Select an image file using file picker
 */
export async function selectImage(): Promise<string | undefined> {
	const result = await vscode.window.showOpenDialog({
		canSelectFiles: true,
		canSelectMany: false,
		filters: { 'Images': ['png', 'jpg', 'jpeg', 'gif', 'webp'] }
	});

	return result?.[0]?.fsPath;
}

/**
 * Select an image file with more format options
 */
export async function selectImageFile(): Promise<string | undefined> {
	const result = await vscode.window.showOpenDialog({
		canSelectFiles: true,
		canSelectFolders: false,
		canSelectMany: false,
		filters: {
			'Images': ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'svg']
		},
		title: 'Select an image to attach'
	});

	return result?.[0]?.fsPath;
}

/**
 * Create a temporary image file from base64 data
 */
export function createImageFile(imageData: string, imageType: string): string {
	const fs = require('fs');
	const os = require('os');

	// Extract base64 data (remove data:image/png;base64, prefix if present)
	const base64Match = imageData.match(/^data:image\/\w+;base64,(.+)$/);
	const base64String = base64Match ? base64Match[1] : imageData;

	// Determine file extension from MIME type
	const ext = imageType.replace('image/', '').replace('jpeg', 'jpg');
	const fileName = `image-${Date.now()}.${ext}`;

	// Create temp file
	const tempDir = os.tmpdir();
	const filePath = path.join(tempDir, fileName);

	// Write the file
	const buffer = Buffer.from(base64String, 'base64');
	fs.writeFileSync(filePath, buffer);

	console.log(`[VSCodeUtilities] Created image file: ${filePath}`);
	return filePath;
}

/**
 * Open a terminal with a specific command
 * Reuses existing terminal with same name if available
 */
export function openTerminal(name: string, command: string): void {
	// Try to find existing terminal with same name
	let terminal = vscode.window.terminals.find(t => t.name === name);

	if (!terminal) {
		// Create new terminal with explicit shell path for macOS
		const shellPath = process.platform === 'darwin'
			? '/bin/zsh'  // Use zsh on macOS (default since Catalina)
			: undefined;   // Use VS Code default on other platforms

		terminal = vscode.window.createTerminal({
			name,
			shellPath
		});
	}

	terminal.show();
	terminal.sendText(command);
}

/**
 * Run a file in the terminal with appropriate interpreter
 */
export function runFileInTerminal(filePath: string): void {
	const ext = path.extname(filePath).toLowerCase();
	const fileName = path.basename(filePath);

	// Determine the appropriate command based on file extension
	let command = '';
	switch (ext) {
		case '.js':
			command = `node "${filePath}"`;
			break;
		case '.ts':
			command = `ts-node "${filePath}"`;
			break;
		case '.py':
			command = `python3 "${filePath}"`;
			break;
		case '.sh':
			command = `bash "${filePath}"`;
			break;
		case '.rb':
			command = `ruby "${filePath}"`;
			break;
		case '.go':
			command = `go run "${filePath}"`;
			break;
		case '.java':
			// For Java, we need to compile first
			const javaClass = fileName.replace('.java', '');
			command = `javac "${filePath}" && java ${javaClass}`;
			break;
		case '.c':
			// For C, compile and run
			const cOutput = fileName.replace('.c', '');
			command = `gcc "${filePath}" -o ${cOutput} && ./${cOutput}`;
			break;
		case '.cpp':
			// For C++, compile and run
			const cppOutput = fileName.replace('.cpp', '');
			command = `g++ "${filePath}" -o ${cppOutput} && ./${cppOutput}`;
			break;
		case '.rs':
			command = `rustc "${filePath}" && ./${fileName.replace('.rs', '')}`;
			break;
		case '.php':
			command = `php "${filePath}"`;
			break;
		default:
			// For unknown types, try to execute directly
			command = `"${filePath}"`;
			break;
	}

	// Create or reuse terminal for running files
	openTerminal(`Run ${fileName}`, command);
}

/**
 * Get text from clipboard
 */
export async function getClipboardText(): Promise<string> {
	return await vscode.env.clipboard.readText();
}

/**
 * Get settings from configuration
 */
export function getSettings(): Record<string, any> {
	const config = vscode.workspace.getConfiguration('claudeCodeChat');
	return {
		'thinking.intensity': config.get('thinking.intensity', 'think'),
		'wsl.enabled': config.get('wsl.enabled', false),
		'wsl.distro': config.get('wsl.distro', 'Ubuntu'),
		'permissions.yoloMode': config.get('permissions.yoloMode', false)
	};
}

/**
 * Update settings in configuration
 */
export function updateSettings(settings: Record<string, any>): void {
	const config = vscode.workspace.getConfiguration('claudeCodeChat');
	for (const [key, value] of Object.entries(settings)) {
		config.update(key, value, vscode.ConfigurationTarget.Global);
	}
}

/**
 * Enable YOLO mode (skip all permissions)
 */
export function enableYoloMode(): void {
	const config = vscode.workspace.getConfiguration('claudeCodeChat');
	config.update('permissions.yoloMode', true, vscode.ConfigurationTarget.Global);
}

/**
 * Get platform information
 */
export function getPlatformInfo(): { platform: string } {
	return { platform: process.platform };
}
