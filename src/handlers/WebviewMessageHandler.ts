/**
 * WebviewMessageHandler - Handles all messages from the webview
 * Centralizes webview communication logic
 */

import * as vscode from 'vscode';
import * as path from 'path';

export class WebviewMessageHandler {
	constructor(
		private readonly context: vscode.ExtensionContext,
		private readonly callbacks: {
			onSendMessage: (text: string, planMode?: boolean, thinkingMode?: boolean) => Promise<void>;
			onNewSession: () => Promise<void>;
			onStopRequest: () => Promise<void>;
			onLoadConversation: (filename: string) => Promise<void>;
			onSetModel: (model: string) => void;
			onOpenModelTerminal: () => void;
			onOpenUsageTerminal: (usageType: string) => void;
			onRunInstallCommand: () => void;
			onExecuteSlashCommand: (command: string) => void;
			onOpenDiff: (filePath: string, oldContent: string, newContent: string) => void;
			onOpenFile: (filePath: string) => void;
			onSelectImage: () => Promise<void>;
			onPermissionResponse: (id: string, approved: boolean, alwaysAllow?: boolean) => void;
			onUserQuestionResponse: (id: string, answers: Record<string, string>) => void;
			onSaveInputText: (text: string) => void;
			onDismissWSLAlert: () => void;
			onSendPermissions: () => Promise<void>;
			onRemovePermission: (toolName: string, command: string | null) => Promise<void>;
			onAddPermission: (toolName: string, command: string | null) => Promise<void>;
			onLoadMCPServers: () => Promise<void>;
			onSaveMCPServer: (name: string, config: any) => Promise<void>;
			onDeleteMCPServer: (name: string) => Promise<void>;
			onSendCustomSnippets: () => Promise<void>;
			onSaveCustomSnippet: (snippet: any) => Promise<void>;
			onDeleteCustomSnippet: (snippetId: string) => Promise<void>;
			onGetActiveConversations: () => void;
			onSwitchConversation: (conversationId: string) => Promise<void>;
			onCloseConversation: (conversationId: string) => Promise<void>;
			onOpenConversationInNewPanel: (filename: string) => Promise<void>;
		}
	) {}

	/**
	 * Handle incoming webview message
	 */
	public async handleMessage(message: any): Promise<void> {
		switch (message.type) {
			case 'sendMessage':
				await this.callbacks.onSendMessage(
					message.text,
					message.planMode,
					message.thinkingMode
				);
				break;

			case 'newSession':
				await this.callbacks.onNewSession();
				break;

			case 'stopRequest':
				await this.callbacks.onStopRequest();
				break;

			case 'requestConversationList':
				// Handled by conversation manager
				break;

			case 'loadConversation':
				await this.callbacks.onLoadConversation(message.filename);
				break;

			case 'setModel':
				this.callbacks.onSetModel(message.model);
				break;

			case 'openModelTerminal':
				this.callbacks.onOpenModelTerminal();
				break;

			case 'openUsageTerminal':
				await this.callbacks.onOpenUsageTerminal(message.usageType);
				break;

			case 'runInstallCommand':
				await this.callbacks.onRunInstallCommand();
				break;

			case 'executeSlashCommand':
				await this.callbacks.onExecuteSlashCommand(message.command);
				break;

			case 'openDiff':
				this.callbacks.onOpenDiff(
					message.filePath,
					message.oldContent,
					message.newContent
				);
				break;

			case 'openFile':
				this.callbacks.onOpenFile(message.filePath);
				break;

			case 'selectImage':
				await this.callbacks.onSelectImage();
				break;

			case 'permissionResponse':
				this.callbacks.onPermissionResponse(
					message.requestId,
					message.approved,
					message.alwaysAllow
				);
				break;

			case 'userQuestionResponse':
				this.callbacks.onUserQuestionResponse(
					message.requestId,
					message.answers
				);
				break;

			case 'saveInputText':
				this.callbacks.onSaveInputText(message.text);
				break;

			case 'dismissWSLAlert':
				this.callbacks.onDismissWSLAlert();
				break;

			case 'sendPermissions':
				await this.callbacks.onSendPermissions();
				break;

			case 'removePermission':
				await this.callbacks.onRemovePermission(
					message.toolName,
					message.command
				);
				break;

			case 'addPermission':
				await this.callbacks.onAddPermission(
					message.toolName,
					message.command
				);
				break;

			case 'loadMCPServers':
				await this.callbacks.onLoadMCPServers();
				break;

			case 'saveMCPServer':
				await this.callbacks.onSaveMCPServer(
					message.name,
					message.config
				);
				break;

			case 'deleteMCPServer':
				await this.callbacks.onDeleteMCPServer(message.name);
				break;

			case 'sendCustomSnippets':
				await this.callbacks.onSendCustomSnippets();
				break;

			case 'saveCustomSnippet':
				await this.callbacks.onSaveCustomSnippet(message.snippet);
				break;

			case 'deleteCustomSnippet':
				await this.callbacks.onDeleteCustomSnippet(message.snippetId);
				break;

			case 'getActiveConversations':
				this.callbacks.onGetActiveConversations();
				break;

			case 'switchConversation':
				await this.callbacks.onSwitchConversation(message.conversationId);
				break;

			case 'closeConversation':
				await this.callbacks.onCloseConversation(message.conversationId);
				break;

			case 'openConversationInNewPanel':
				await this.callbacks.onOpenConversationInNewPanel(message.filename);
				break;

			case 'message':
				// Handle 'message' type as alias for 'sendMessage'
				await this.callbacks.onSendMessage(
					message.content,
					message.planMode,
					message.thinkingMode
				);
				break;

			case 'sendStats':
				// Analytics/telemetry - silently ignore if telemetry is disabled
				if (vscode.env.isTelemetryEnabled) {
					console.log('[Telemetry]', message.eventName);
				}
				break;

			case 'ready':
			case 'getPlatformInfo':
			case 'togglePlanMode':
			case 'toggleThinkingMode':
				// These messages are handled directly in extension.ts or can be safely ignored
				break;

			default:
				console.log('Unknown message type:', message.type);
		}
	}

	/**
	 * Open diff editor for file changes
	 */
	public async openDiff(filePath: string, oldContent: string, newContent: string): Promise<void> {
		const fileName = path.basename(filePath);

		// Create URIs for diff
		const leftUri = vscode.Uri.parse(`claude-diff:${filePath}?old`).with({
			fragment: oldContent
		});
		const rightUri = vscode.Uri.parse(`claude-diff:${filePath}?new`).with({
			fragment: newContent
		});

		await vscode.commands.executeCommand(
			'vscode.diff',
			leftUri,
			rightUri,
			`${fileName} (Claude's proposed changes)`
		);
	}

	/**
	 * Open file in editor
	 */
	public async openFile(filePath: string): Promise<void> {
		try {
			const uri = vscode.Uri.file(filePath);
			await vscode.window.showTextDocument(uri);
		} catch (error: any) {
			vscode.window.showErrorMessage(`Failed to open file: ${error.message}`);
		}
	}

	/**
	 * Select image file
	 */
	public async selectImage(): Promise<string | undefined> {
		const result = await vscode.window.showOpenDialog({
			canSelectFiles: true,
			canSelectFolders: false,
			canSelectMany: false,
			filters: {
				'Images': ['png', 'jpg', 'jpeg', 'gif', 'webp']
			},
			title: 'Select Image'
		});

		if (result && result[0]) {
			return result[0].fsPath;
		}

		return undefined;
	}
}
