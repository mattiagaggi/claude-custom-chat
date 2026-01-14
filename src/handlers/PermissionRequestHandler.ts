/**
 * PermissionRequestHandler.ts - Permission Prompt Handler
 *
 * Handles permission requests from Claude CLI (tool execution approvals).
 * Manages pending permission requests, checks auto-approval rules via PermissionManager,
 * sends permission prompts to the webview, and writes responses back to Claude CLI stdin.
 * Also handles AskUserQuestion tool requests.
 */

import { PermissionManager, ProcessManager } from '../managers';

export interface PermissionRequestHandlerConfig {
	permissionManager: PermissionManager;
	processManager: ProcessManager;
	postMessage: (message: any) => void;
	onEditPermissionRequest?: (filePath: string, oldString: string, newString: string) => void;
}

export class PermissionRequestHandler {
	private pendingPermissions = new Map<string, any>();
	private config: PermissionRequestHandlerConfig;

	constructor(config: PermissionRequestHandlerConfig) {
		this.config = config;
	}

	/**
	 * Handle control request (permission prompt)
	 */
	async handleControlRequest(requestData: any, conversationId?: string): Promise<void> {
		const request_id = requestData.request_id;
		const tool_name = requestData.request?.tool_name || requestData.tool_name;
		const input = requestData.request?.input || requestData.input;

		console.log('[PermissionHandler] ⚠️ PERMISSION REQUEST RECEIVED ⚠️');
		console.log('[PermissionHandler] Control request RAW:', JSON.stringify(requestData, null, 2));
		console.log('[PermissionHandler] Control request:', { request_id, tool_name, input, conversationId });

		// Handle AskUserQuestion specially - it's not a permission request
		if (tool_name === 'AskUserQuestion') {
			this.handleUserQuestion(request_id, input, conversationId);
			return;
		}

		// Check if auto-approved
		if (await this.config.permissionManager.shouldAutoApprove(tool_name, input)) {
			this.sendPermissionResponse(request_id, true, undefined, undefined, undefined, conversationId);
			return;
		}

		// Store pending request with conversationId
		this.pendingPermissions.set(request_id, { ...requestData, conversationId });

		// For Edit tool, open the file and highlight the changes
		if (tool_name === 'Edit' && input?.file_path && input?.old_string && input?.new_string) {
			this.config.onEditPermissionRequest?.(input.file_path, input.old_string, input.new_string);
		}

		// Show UI prompt
		this.config.postMessage({
			type: 'permissionRequest',
			data: {
				id: request_id,
				toolName: tool_name,
				input,
				status: 'pending',
				suggestions: requestData.request?.suggestions || requestData.suggestions,
				conversationId
			}
		});
	}

	/**
	 * Handle AskUserQuestion tool
	 */
	private handleUserQuestion(requestId: string, input: any, conversationId?: string): void {
		// Store pending question with conversationId
		this.pendingPermissions.set(requestId, { request_id: requestId, tool_name: 'AskUserQuestion', input, conversationId });

		// Send to UI
		this.config.postMessage({
			type: 'userQuestion',
			data: {
				id: requestId,
				questions: input.questions || [],
				conversationId
			}
		});
	}

	/**
	 * Handle permission response from UI
	 */
	handlePermissionResponse(id: string, approved: boolean, alwaysAllow?: boolean): void {
		const request = this.pendingPermissions.get(id);
		if (!request) {
			return;
		}

		const tool_name = request.request?.tool_name || request.tool_name;
		const input = request.request?.input || request.input;
		const tool_use_id = request.request?.tool_use_id || request.tool_use_id;
		const conversationId = request.conversationId;

		if (approved && alwaysAllow) {
			this.config.permissionManager.addAlwaysAllowPermission(tool_name, input);
		}

		this.sendPermissionResponse(id, approved, input, tool_use_id, alwaysAllow ? tool_name : undefined, conversationId);
		this.pendingPermissions.delete(id);
	}

	/**
	 * Handle user question response from UI
	 */
	handleUserQuestionResponse(id: string, answers: Record<string, string>): void {
		const request = this.pendingPermissions.get(id);
		if (!request) {
			return;
		}

		const conversationId = request.conversationId;

		// Send answer back to Claude
		const response = {
			type: 'control_response',
			response: {
				subtype: 'success',
				request_id: id,
				response: { answers }
			}
		};

		console.log('[PermissionHandler] Sending user question response:', response, 'to conversation:', conversationId);

		// Write to the specific conversation's process if conversationId provided
		let writeResult: boolean;
		if (conversationId) {
			writeResult = this.config.processManager.writeToConversation(conversationId, JSON.stringify(response) + '\n');
		} else {
			writeResult = this.config.processManager.write(JSON.stringify(response) + '\n');
		}
		console.log('[PermissionHandler] Write result:', writeResult);

		this.pendingPermissions.delete(id);
	}

	/**
	 * Send permission response to Claude
	 */
	private sendPermissionResponse(requestId: string, approved: boolean, input?: any, toolUseId?: string, alwaysAllowTool?: string, conversationId?: string): void {
		console.log('[PermissionHandler] ========== SENDING PERMISSION RESPONSE ==========');
		console.log('[PermissionHandler] Request ID:', requestId);
		console.log('[PermissionHandler] Approved:', approved);
		console.log('[PermissionHandler] Tool Use ID:', toolUseId);
		console.log('[PermissionHandler] Conversation ID:', conversationId);

		let response: any;
		if (approved) {
			response = {
				type: 'control_response',
				response: {
					subtype: 'success',
					request_id: requestId,
					response: {
						behavior: 'allow',
						updatedInput: input,
						toolUseID: toolUseId
					}
				}
			};
			// Add updatedPermissions if always allow was selected
			if (alwaysAllowTool) {
				// Format according to Claude SDK PermissionUpdate type
				response.response.response.updatedPermissions = [{
					type: 'addRules',
					rules: [{ toolName: alwaysAllowTool }],
					behavior: 'allow',
					destination: 'session'
				}];
			}
		} else {
			response = {
				type: 'control_response',
				response: {
					subtype: 'success',
					request_id: requestId,
					response: {
						behavior: 'deny',
						message: 'User denied permission',
						interrupt: true,
						toolUseID: toolUseId
					}
				}
			};
		}

		console.log('[PermissionHandler] Response object:', JSON.stringify(response, null, 2));
		const responseStr = JSON.stringify(response) + '\n';
		console.log('[PermissionHandler] Response string:', responseStr);
		console.log('[PermissionHandler] Response bytes:', Buffer.from(responseStr).length);

		// Write to the specific conversation's process if conversationId provided
		// Otherwise fall back to the current process (legacy behavior)
		let writeResult: boolean;
		if (conversationId) {
			console.log('[PermissionHandler] Writing to conversation:', conversationId);
			writeResult = this.config.processManager.writeToConversation(conversationId, responseStr);
		} else {
			console.log('[PermissionHandler] Writing to current process (no conversationId)');
			console.log('[PermissionHandler] Process running before write:', this.config.processManager.isRunning());
			writeResult = this.config.processManager.write(responseStr);
		}
		console.log('[PermissionHandler] Write result:', writeResult);

		// Verify the process is still running
		if (conversationId) {
			const isRunning = this.config.processManager.isConversationRunning(conversationId);
			if (isRunning) {
				console.log('[PermissionHandler] Conversation process is still running after write ✓');
			} else {
				console.error('[PermissionHandler] Conversation process died after write! ✗');
			}
		} else {
			if (this.config.processManager.isRunning()) {
				console.log('[PermissionHandler] Process is still running after write ✓');
			} else {
				console.error('[PermissionHandler] Process died after write! ✗');
			}
		}

		this.config.postMessage({ type: 'updatePermissionStatus', data: { id: requestId, status: approved ? 'approved' : 'denied' } });

		// Monitor for response
		console.log('[PermissionHandler] Waiting for Claude response...');
		let checkCount = 0;
		const checkInterval = setInterval(() => {
			checkCount++;
			const running = conversationId
				? this.config.processManager.isConversationRunning(conversationId)
				: this.config.processManager.isRunning();
			console.log(`[PermissionHandler] Check ${checkCount}/5: processRunning=${running}`);
			if (checkCount >= 5) {
				clearInterval(checkInterval);
			}
		}, 2000);

		// Set a timeout to detect if Claude isn't responding
		setTimeout(() => {
			clearInterval(checkInterval);
			const running = conversationId
				? this.config.processManager.isConversationRunning(conversationId)
				: this.config.processManager.isRunning();
			if (running) {
				console.warn('[PermissionHandler] Claude has not responded 10 seconds after permission approval');
				console.warn('[PermissionHandler] This might indicate the process is stuck');
			}
		}, 10000);
	}

	/**
	 * Clear all pending permissions
	 */
	clearPending(): void {
		this.pendingPermissions.clear();
	}

	/**
	 * Check if there are pending permissions
	 */
	hasPending(): boolean {
		return this.pendingPermissions.size > 0;
	}

	/**
	 * Resend all pending permission requests to the UI
	 * Called when switching conversations to restore permission prompts
	 */
	resendPendingPermissions(): void {
		for (const [request_id, requestData] of this.pendingPermissions) {
			const tool_name = requestData.request?.tool_name || requestData.tool_name;
			const input = requestData.request?.input || requestData.input;

			if (tool_name === 'AskUserQuestion') {
				// Resend user question
				this.config.postMessage({
					type: 'userQuestion',
					data: {
						id: request_id,
						questions: input.questions || []
					}
				});
			} else {
				// Resend permission request
				this.config.postMessage({
					type: 'permissionRequest',
					data: {
						id: request_id,
						toolName: tool_name,
						input,
						status: 'pending',
						suggestions: requestData.request?.suggestions || requestData.suggestions
					}
				});
			}
		}
	}
}
