/**
 * PermissionRequestHandler Unit Tests
 * Tests permission request handling, auto-approval, and response generation
 */

import * as assert from 'assert';
import { PermissionRequestHandler, PermissionRequestHandlerConfig } from '../../src/handlers/PermissionRequestHandler';

// Mock PermissionManager
class MockPermissionManager {
	private autoApproveRules: Map<string, Set<string>> = new Map();
	private addedPermissions: Array<{ toolName: string; input: any }> = [];

	async shouldAutoApprove(toolName: string, input: any): Promise<boolean> {
		const rules = this.autoApproveRules.get(toolName);
		if (!rules) return false;

		// For Bash, check command
		if (toolName === 'Bash' && input?.command) {
			return rules.has(input.command) || rules.has('*');
		}
		// For file tools, check path
		if (['Read', 'Write', 'Edit'].includes(toolName) && input?.file_path) {
			return rules.has(input.file_path) || rules.has('*');
		}
		return rules.has('*');
	}

	addAlwaysAllowPermission(toolName: string, input: any): void {
		this.addedPermissions.push({ toolName, input });
	}

	// Test helpers
	setAutoApprove(toolName: string, patterns: string[]): void {
		this.autoApproveRules.set(toolName, new Set(patterns));
	}

	getAddedPermissions(): Array<{ toolName: string; input: any }> {
		return this.addedPermissions;
	}

	clearAddedPermissions(): void {
		this.addedPermissions = [];
	}
}

// Mock ProcessManager
class MockProcessManager {
	private writtenMessages: Array<{ message: string; conversationId?: string }> = [];
	private runningConversations: Set<string> = new Set(['conv-1']);
	private running = true;

	write(message: string): boolean {
		this.writtenMessages.push({ message });
		return this.running;
	}

	writeToConversation(conversationId: string, message: string): boolean {
		this.writtenMessages.push({ message, conversationId });
		return this.runningConversations.has(conversationId);
	}

	isRunning(): boolean {
		return this.running;
	}

	isConversationRunning(conversationId: string): boolean {
		return this.runningConversations.has(conversationId);
	}

	// Test helpers
	getWrittenMessages(): Array<{ message: string; conversationId?: string }> {
		return this.writtenMessages;
	}

	clearWrittenMessages(): void {
		this.writtenMessages = [];
	}

	setRunning(running: boolean): void {
		this.running = running;
	}

	setConversationRunning(conversationId: string, running: boolean): void {
		if (running) {
			this.runningConversations.add(conversationId);
		} else {
			this.runningConversations.delete(conversationId);
		}
	}
}

suite('PermissionRequestHandler Tests', () => {
	let mockPermissionManager: MockPermissionManager;
	let mockProcessManager: MockProcessManager;
	let postedMessages: any[];
	let editRequests: Array<{ filePath: string; oldString: string; newString: string }>;
	let handler: PermissionRequestHandler;

	setup(() => {
		mockPermissionManager = new MockPermissionManager();
		mockProcessManager = new MockProcessManager();
		postedMessages = [];
		editRequests = [];

		const config: PermissionRequestHandlerConfig = {
			permissionManager: mockPermissionManager as any,
			processManager: mockProcessManager as any,
			postMessage: (msg) => postedMessages.push(msg),
			onEditPermissionRequest: (filePath, oldString, newString) => {
				editRequests.push({ filePath, oldString, newString });
			}
		};

		handler = new PermissionRequestHandler(config);
	});

	suite('handleControlRequest', () => {
		test('Should auto-approve when permission manager allows', async () => {
			mockPermissionManager.setAutoApprove('Bash', ['npm test']);

			await handler.handleControlRequest({
				type: 'control_request',
				request_id: 'req-1',
				tool_name: 'Bash',
				input: { command: 'npm test' }
			});

			// Should not show UI prompt
			const permissionRequests = postedMessages.filter(m => m.type === 'permissionRequest');
			assert.strictEqual(permissionRequests.length, 0);

			// Should send approval response
			const written = mockProcessManager.getWrittenMessages();
			assert.strictEqual(written.length, 1);
			const response = JSON.parse(written[0].message.trim());
			assert.strictEqual(response.type, 'control_response');
			assert.strictEqual(response.response.response.behavior, 'allow');
		});

		test('Should show UI prompt when not auto-approved', async () => {
			await handler.handleControlRequest({
				type: 'control_request',
				request_id: 'req-2',
				tool_name: 'Bash',
				input: { command: 'rm -rf /' }
			});

			// Should show UI prompt
			const permissionRequests = postedMessages.filter(m => m.type === 'permissionRequest');
			assert.strictEqual(permissionRequests.length, 1);
			assert.strictEqual(permissionRequests[0].data.id, 'req-2');
			assert.strictEqual(permissionRequests[0].data.toolName, 'Bash');
			assert.strictEqual(permissionRequests[0].data.status, 'pending');

			// Should NOT send response yet
			assert.strictEqual(mockProcessManager.getWrittenMessages().length, 0);
		});

		test('Should handle nested request format', async () => {
			await handler.handleControlRequest({
				type: 'control_request',
				request_id: 'req-3',
				request: {
					tool_name: 'Read',
					input: { file_path: '/etc/passwd' }
				}
			});

			const permissionRequests = postedMessages.filter(m => m.type === 'permissionRequest');
			assert.strictEqual(permissionRequests.length, 1);
			assert.strictEqual(permissionRequests[0].data.toolName, 'Read');
			assert.strictEqual(permissionRequests[0].data.input.file_path, '/etc/passwd');
		});

		test('Should call onEditPermissionRequest for Edit tool', async () => {
			await handler.handleControlRequest({
				type: 'control_request',
				request_id: 'req-4',
				tool_name: 'Edit',
				input: {
					file_path: '/src/test.ts',
					old_string: 'const x = 1;',
					new_string: 'const x = 2;'
				}
			});

			assert.strictEqual(editRequests.length, 1);
			assert.strictEqual(editRequests[0].filePath, '/src/test.ts');
			assert.strictEqual(editRequests[0].oldString, 'const x = 1;');
			assert.strictEqual(editRequests[0].newString, 'const x = 2;');
		});

		test('Should include conversationId in pending request', async () => {
			await handler.handleControlRequest({
				type: 'control_request',
				request_id: 'req-5',
				tool_name: 'Bash',
				input: { command: 'ls' }
			}, 'conv-123');

			const permissionRequests = postedMessages.filter(m => m.type === 'permissionRequest');
			assert.strictEqual(permissionRequests[0].data.conversationId, 'conv-123');
		});

		test('Should include suggestions in UI prompt', async () => {
			await handler.handleControlRequest({
				type: 'control_request',
				request_id: 'req-6',
				tool_name: 'Bash',
				input: { command: 'npm install' },
				suggestions: ['npm install', 'npm ci']
			});

			const permissionRequests = postedMessages.filter(m => m.type === 'permissionRequest');
			assert.deepStrictEqual(permissionRequests[0].data.suggestions, ['npm install', 'npm ci']);
		});
	});

	suite('handleControlRequest - AskUserQuestion', () => {
		test('Should handle AskUserQuestion as user question, not permission', async () => {
			await handler.handleControlRequest({
				type: 'control_request',
				request_id: 'q-1',
				tool_name: 'AskUserQuestion',
				input: {
					questions: [
						{ question: 'Which database?', options: ['PostgreSQL', 'MySQL'] }
					]
				}
			});

			// Should NOT show permission request
			const permissionRequests = postedMessages.filter(m => m.type === 'permissionRequest');
			assert.strictEqual(permissionRequests.length, 0);

			// Should show user question
			const userQuestions = postedMessages.filter(m => m.type === 'userQuestion');
			assert.strictEqual(userQuestions.length, 1);
			assert.strictEqual(userQuestions[0].data.id, 'q-1');
			assert.strictEqual(userQuestions[0].data.questions.length, 1);
		});

		test('Should include conversationId in user question', async () => {
			await handler.handleControlRequest({
				type: 'control_request',
				request_id: 'q-2',
				tool_name: 'AskUserQuestion',
				input: { questions: [] }
			}, 'conv-456');

			const userQuestions = postedMessages.filter(m => m.type === 'userQuestion');
			assert.strictEqual(userQuestions[0].data.conversationId, 'conv-456');
		});
	});

	suite('handlePermissionResponse', () => {
		test('Should send approval response when approved', async () => {
			// First create a pending request
			await handler.handleControlRequest({
				type: 'control_request',
				request_id: 'req-approve',
				tool_name: 'Bash',
				input: { command: 'npm test' }
			});
			mockProcessManager.clearWrittenMessages();
			postedMessages.length = 0;

			// Approve it
			handler.handlePermissionResponse('req-approve', true, false);

			const written = mockProcessManager.getWrittenMessages();
			assert.strictEqual(written.length, 1);
			const response = JSON.parse(written[0].message.trim());
			assert.strictEqual(response.type, 'control_response');
			assert.strictEqual(response.response.response.behavior, 'allow');

			// Should update UI
			const statusUpdates = postedMessages.filter(m => m.type === 'updatePermissionStatus');
			assert.strictEqual(statusUpdates.length, 1);
			assert.strictEqual(statusUpdates[0].data.status, 'approved');
		});

		test('Should send denial response when denied', async () => {
			await handler.handleControlRequest({
				type: 'control_request',
				request_id: 'req-deny',
				tool_name: 'Bash',
				input: { command: 'rm -rf /' }
			});
			mockProcessManager.clearWrittenMessages();
			postedMessages.length = 0;

			handler.handlePermissionResponse('req-deny', false);

			const written = mockProcessManager.getWrittenMessages();
			assert.strictEqual(written.length, 1);
			const response = JSON.parse(written[0].message.trim());
			assert.strictEqual(response.response.response.behavior, 'deny');
			assert.strictEqual(response.response.response.interrupt, true);

			const statusUpdates = postedMessages.filter(m => m.type === 'updatePermissionStatus');
			assert.strictEqual(statusUpdates[0].data.status, 'denied');
		});

		test('Should add always-allow permission when alwaysAllow is true', async () => {
			await handler.handleControlRequest({
				type: 'control_request',
				request_id: 'req-always',
				tool_name: 'Read',
				input: { file_path: '/src/index.ts' }
			});
			mockProcessManager.clearWrittenMessages();

			handler.handlePermissionResponse('req-always', true, true);

			const added = mockPermissionManager.getAddedPermissions();
			assert.strictEqual(added.length, 1);
			assert.strictEqual(added[0].toolName, 'Read');

			// Should include updatedPermissions in response
			const written = mockProcessManager.getWrittenMessages();
			const response = JSON.parse(written[0].message.trim());
			assert.ok(response.response.response.updatedPermissions);
			assert.strictEqual(response.response.response.updatedPermissions[0].rules[0].toolName, 'Read');
		});

		test('Should do nothing for unknown request ID', () => {
			handler.handlePermissionResponse('unknown-id', true);

			// Should not write anything
			assert.strictEqual(mockProcessManager.getWrittenMessages().length, 0);
		});

		test('Should write to specific conversation when conversationId is set', async () => {
			await handler.handleControlRequest({
				type: 'control_request',
				request_id: 'req-conv',
				tool_name: 'Bash',
				input: { command: 'ls' }
			}, 'conv-1');
			mockProcessManager.clearWrittenMessages();

			handler.handlePermissionResponse('req-conv', true);

			const written = mockProcessManager.getWrittenMessages();
			assert.strictEqual(written.length, 1);
			assert.strictEqual(written[0].conversationId, 'conv-1');
		});
	});

	suite('handleUserQuestionResponse', () => {
		test('Should send user answer back to Claude with correct format', async () => {
			// Create pending question
			await handler.handleControlRequest({
				type: 'control_request',
				request_id: 'q-answer',
				tool_name: 'AskUserQuestion',
				input: { questions: [{ question: 'Which?', options: ['A', 'B'] }] }
			});
			mockProcessManager.clearWrittenMessages();

			handler.handleUserQuestionResponse('q-answer', { 'q0': '0' });

			const written = mockProcessManager.getWrittenMessages();
			assert.strictEqual(written.length, 1);
			const response = JSON.parse(written[0].message.trim());
			assert.strictEqual(response.type, 'control_response');
			assert.strictEqual(response.response.subtype, 'success');
			assert.strictEqual(response.response.request_id, 'q-answer');
			assert.deepStrictEqual(response.response.response.answers, { 'q0': '0' });
		});

		test('Should handle multiple choice single select response', async () => {
			await handler.handleControlRequest({
				type: 'control_request',
				request_id: 'q-single',
				tool_name: 'AskUserQuestion',
				input: {
					questions: [{
						header: 'Database',
						question: 'Which database should we use?',
						multiSelect: false,
						options: [
							{ label: 'PostgreSQL', description: 'Relational database' },
							{ label: 'MongoDB', description: 'Document database' },
							{ label: 'Redis', description: 'In-memory store' }
						]
					}]
				}
			});
			mockProcessManager.clearWrittenMessages();

			// User selects second option (index 1)
			handler.handleUserQuestionResponse('q-single', { 'q0': '1' });

			const written = mockProcessManager.getWrittenMessages();
			const response = JSON.parse(written[0].message.trim());
			assert.strictEqual(response.type, 'control_response');
			assert.strictEqual(response.response.subtype, 'success');
			assert.deepStrictEqual(response.response.response.answers, { 'q0': '1' });
		});

		test('Should handle multiple choice multi-select response', async () => {
			await handler.handleControlRequest({
				type: 'control_request',
				request_id: 'q-multi',
				tool_name: 'AskUserQuestion',
				input: {
					questions: [{
						header: 'Features',
						question: 'Which features do you want?',
						multiSelect: true,
						options: [
							{ label: 'Auth', description: 'Authentication' },
							{ label: 'API', description: 'REST API' },
							{ label: 'DB', description: 'Database' },
							{ label: 'Cache', description: 'Caching' }
						]
					}]
				}
			});
			mockProcessManager.clearWrittenMessages();

			// User selects multiple options (indices 0, 2, 3)
			handler.handleUserQuestionResponse('q-multi', { 'q0': '0,2,3' });

			const written = mockProcessManager.getWrittenMessages();
			const response = JSON.parse(written[0].message.trim());
			assert.strictEqual(response.type, 'control_response');
			assert.deepStrictEqual(response.response.response.answers, { 'q0': '0,2,3' });
		});

		test('Should handle multiple questions response', async () => {
			await handler.handleControlRequest({
				type: 'control_request',
				request_id: 'q-multiple',
				tool_name: 'AskUserQuestion',
				input: {
					questions: [
						{
							header: 'Framework',
							question: 'Which framework?',
							multiSelect: false,
							options: [{ label: 'React' }, { label: 'Vue' }]
						},
						{
							header: 'Styling',
							question: 'Which CSS approach?',
							multiSelect: false,
							options: [{ label: 'Tailwind' }, { label: 'CSS Modules' }]
						},
						{
							header: 'Testing',
							question: 'Which test frameworks?',
							multiSelect: true,
							options: [{ label: 'Jest' }, { label: 'Vitest' }, { label: 'Cypress' }]
						}
					]
				}
			});
			mockProcessManager.clearWrittenMessages();

			// User answers all questions
			handler.handleUserQuestionResponse('q-multiple', {
				'q0': '0',      // React
				'q1': '1',      // CSS Modules
				'q2': '0,2'     // Jest and Cypress
			});

			const written = mockProcessManager.getWrittenMessages();
			const response = JSON.parse(written[0].message.trim());
			assert.strictEqual(response.type, 'control_response');
			assert.strictEqual(response.response.subtype, 'success');
			assert.strictEqual(response.response.request_id, 'q-multiple');
			assert.deepStrictEqual(response.response.response.answers, {
				'q0': '0',
				'q1': '1',
				'q2': '0,2'
			});
		});

		test('Should write to specific conversation when conversationId is set', async () => {
			await handler.handleControlRequest({
				type: 'control_request',
				request_id: 'q-conv',
				tool_name: 'AskUserQuestion',
				input: { questions: [] }
			}, 'conv-1');
			mockProcessManager.clearWrittenMessages();

			handler.handleUserQuestionResponse('q-conv', { answer: 'test' });

			const written = mockProcessManager.getWrittenMessages();
			assert.strictEqual(written[0].conversationId, 'conv-1');
		});

		test('Should do nothing for unknown request ID', () => {
			handler.handleUserQuestionResponse('unknown', { answer: 'test' });

			assert.strictEqual(mockProcessManager.getWrittenMessages().length, 0);
		});

		test('Should format response matching permission response structure', async () => {
			// This test verifies the user question response uses the same nested
			// structure as permission responses for consistency with Claude SDK
			await handler.handleControlRequest({
				type: 'control_request',
				request_id: 'q-format',
				tool_name: 'AskUserQuestion',
				input: { questions: [{ question: 'Test?', options: ['Yes', 'No'] }] }
			});
			mockProcessManager.clearWrittenMessages();

			handler.handleUserQuestionResponse('q-format', { 'q0': '0' });

			const written = mockProcessManager.getWrittenMessages();
			const response = JSON.parse(written[0].message.trim());

			// Verify nested structure matches permission response format
			assert.strictEqual(response.type, 'control_response');
			assert.ok(response.response, 'Should have nested response object');
			assert.strictEqual(response.response.subtype, 'success');
			assert.strictEqual(response.response.request_id, 'q-format');
			assert.ok(response.response.response, 'Should have doubly nested response');
			assert.ok(response.response.response.answers, 'Should have answers in nested response');
		});
	});

	suite('clearPending and hasPending', () => {
		test('Should report hasPending correctly', async () => {
			assert.strictEqual(handler.hasPending(), false);

			await handler.handleControlRequest({
				type: 'control_request',
				request_id: 'req-pending',
				tool_name: 'Bash',
				input: { command: 'test' }
			});

			assert.strictEqual(handler.hasPending(), true);
		});

		test('Should clear all pending requests', async () => {
			await handler.handleControlRequest({
				type: 'control_request',
				request_id: 'req-1',
				tool_name: 'Bash',
				input: { command: 'test1' }
			});
			await handler.handleControlRequest({
				type: 'control_request',
				request_id: 'req-2',
				tool_name: 'Bash',
				input: { command: 'test2' }
			});

			assert.strictEqual(handler.hasPending(), true);

			handler.clearPending();

			assert.strictEqual(handler.hasPending(), false);
		});
	});

	suite('resendPendingPermissions', () => {
		test('Should resend all pending permission requests', async () => {
			await handler.handleControlRequest({
				type: 'control_request',
				request_id: 'resend-1',
				tool_name: 'Bash',
				input: { command: 'ls' }
			});
			await handler.handleControlRequest({
				type: 'control_request',
				request_id: 'resend-2',
				tool_name: 'Read',
				input: { file_path: '/test.ts' }
			});

			postedMessages.length = 0;

			handler.resendPendingPermissions();

			const permissionRequests = postedMessages.filter(m => m.type === 'permissionRequest');
			assert.strictEqual(permissionRequests.length, 2);

			const ids = permissionRequests.map(p => p.data.id);
			assert.ok(ids.includes('resend-1'));
			assert.ok(ids.includes('resend-2'));
		});

		test('Should resend pending user questions', async () => {
			await handler.handleControlRequest({
				type: 'control_request',
				request_id: 'q-resend',
				tool_name: 'AskUserQuestion',
				input: { questions: [{ question: 'Test?' }] }
			});

			postedMessages.length = 0;

			handler.resendPendingPermissions();

			const userQuestions = postedMessages.filter(m => m.type === 'userQuestion');
			assert.strictEqual(userQuestions.length, 1);
			assert.strictEqual(userQuestions[0].data.id, 'q-resend');
		});

		test('Should resend mixed permissions and questions', async () => {
			await handler.handleControlRequest({
				type: 'control_request',
				request_id: 'perm-1',
				tool_name: 'Bash',
				input: { command: 'test' }
			});
			await handler.handleControlRequest({
				type: 'control_request',
				request_id: 'q-1',
				tool_name: 'AskUserQuestion',
				input: { questions: [] }
			});

			postedMessages.length = 0;

			handler.resendPendingPermissions();

			const permissionRequests = postedMessages.filter(m => m.type === 'permissionRequest');
			const userQuestions = postedMessages.filter(m => m.type === 'userQuestion');

			assert.strictEqual(permissionRequests.length, 1);
			assert.strictEqual(userQuestions.length, 1);
		});
	});

	suite('Response Format Validation', () => {
		test('Should format approval response correctly', async () => {
			await handler.handleControlRequest({
				type: 'control_request',
				request_id: 'format-test',
				tool_name: 'Bash',
				input: { command: 'echo test' },
				tool_use_id: 'tool-123'
			});
			mockProcessManager.clearWrittenMessages();

			handler.handlePermissionResponse('format-test', true);

			const written = mockProcessManager.getWrittenMessages();
			const response = JSON.parse(written[0].message.trim());

			assert.strictEqual(response.type, 'control_response');
			assert.strictEqual(response.response.subtype, 'success');
			assert.strictEqual(response.response.request_id, 'format-test');
			assert.strictEqual(response.response.response.behavior, 'allow');
			assert.ok(response.response.response.updatedInput);
		});

		test('Should format denial response correctly', async () => {
			await handler.handleControlRequest({
				type: 'control_request',
				request_id: 'deny-format',
				tool_name: 'Write',
				input: { file_path: '/etc/hosts', content: 'hack' },
				tool_use_id: 'tool-456'
			});
			mockProcessManager.clearWrittenMessages();

			handler.handlePermissionResponse('deny-format', false);

			const written = mockProcessManager.getWrittenMessages();
			const response = JSON.parse(written[0].message.trim());

			assert.strictEqual(response.response.response.behavior, 'deny');
			assert.strictEqual(response.response.response.message, 'User denied permission');
			assert.strictEqual(response.response.response.interrupt, true);
		});

		test('Should include updatedPermissions in always-allow response', async () => {
			await handler.handleControlRequest({
				type: 'control_request',
				request_id: 'always-format',
				tool_name: 'Bash',
				input: { command: 'npm test' }
			});
			mockProcessManager.clearWrittenMessages();

			handler.handlePermissionResponse('always-format', true, true);

			const written = mockProcessManager.getWrittenMessages();
			const response = JSON.parse(written[0].message.trim());

			const updatedPermissions = response.response.response.updatedPermissions;
			assert.ok(updatedPermissions);
			assert.strictEqual(updatedPermissions[0].type, 'addRules');
			assert.strictEqual(updatedPermissions[0].behavior, 'allow');
			assert.strictEqual(updatedPermissions[0].destination, 'session');
			assert.strictEqual(updatedPermissions[0].rules[0].toolName, 'Bash');
		});
	});
});
