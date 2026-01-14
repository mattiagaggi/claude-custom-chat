/**
 * WebviewMessageHandler Unit Tests
 * Tests message routing and callback invocation
 */

import * as assert from 'assert';

// Mock vscode context
const mockContext = {
	subscriptions: [],
	extensionPath: '/mock/path'
};

// Import the handler
import { WebviewMessageHandler } from '../../src/handlers/WebviewMessageHandler';

suite('WebviewMessageHandler Tests', () => {

	suite('Message Type Routing', () => {
		test('Should route sendMessage to onSendMessage callback', async () => {
			let callbackCalled = false;
			let receivedText = '';
			let receivedPlanMode = false;
			let receivedThinkingMode = false;

			const handler = new WebviewMessageHandler(mockContext as any, {
				onSendMessage: async (text, planMode, thinkingMode) => {
					callbackCalled = true;
					receivedText = text;
					receivedPlanMode = planMode || false;
					receivedThinkingMode = thinkingMode || false;
				},
				onNewSession: async () => {},
				onStopRequest: async () => {},
				onLoadConversation: async () => {},
				onSetModel: () => {},
				onOpenModelTerminal: () => {},
				onOpenUsageTerminal: () => {},
				onRunInstallCommand: () => {},
				onExecuteSlashCommand: () => {},
				onOpenDiff: () => {},
				onOpenFile: () => {},
				onSelectImage: async () => {},
				onPermissionResponse: () => {},
				onUserQuestionResponse: () => {},
				onSaveInputText: () => {},
				onDismissWSLAlert: () => {},
				onSendPermissions: async () => {},
				onRemovePermission: async () => {},
				onAddPermission: async () => {},
				onLoadMCPServers: async () => {},
				onSaveMCPServer: async () => {},
				onDeleteMCPServer: async () => {},
				onSendCustomSnippets: async () => {},
				onSaveCustomSnippet: async () => {},
				onDeleteCustomSnippet: async () => {},
				onGetActiveConversations: () => {},
				onSwitchConversation: async () => {},
				onCloseConversation: async () => {},
				onOpenConversationInNewPanel: async () => {}
			});

			await handler.handleMessage({
				type: 'sendMessage',
				text: 'Hello Claude',
				planMode: true,
				thinkingMode: false
			});

			assert.strictEqual(callbackCalled, true);
			assert.strictEqual(receivedText, 'Hello Claude');
			assert.strictEqual(receivedPlanMode, true);
			assert.strictEqual(receivedThinkingMode, false);
		});

		test('Should route newSession to onNewSession callback', async () => {
			let callbackCalled = false;

			const handler = createHandler({
				onNewSession: async () => { callbackCalled = true; }
			});

			await handler.handleMessage({ type: 'newSession' });

			assert.strictEqual(callbackCalled, true);
		});

		test('Should route stopRequest to onStopRequest callback', async () => {
			let callbackCalled = false;

			const handler = createHandler({
				onStopRequest: async () => { callbackCalled = true; }
			});

			await handler.handleMessage({ type: 'stopRequest' });

			assert.strictEqual(callbackCalled, true);
		});

		test('Should route loadConversation with filename', async () => {
			let receivedFilename = '';

			const handler = createHandler({
				onLoadConversation: async (filename: string) => { receivedFilename = filename; }
			});

			await handler.handleMessage({ type: 'loadConversation', filename: 'conversation-123.json' });

			assert.strictEqual(receivedFilename, 'conversation-123.json');
		});

		test('Should route setModel with model name', async () => {
			let receivedModel = '';

			const handler = createHandler({
				onSetModel: (model: string) => { receivedModel = model; }
			});

			await handler.handleMessage({ type: 'setModel', model: 'claude-3-opus' });

			assert.strictEqual(receivedModel, 'claude-3-opus');
		});

		test('Should route permissionResponse with all fields', async () => {
			let receivedId = '';
			let receivedApproved = false;
			let receivedAlwaysAllow: boolean | undefined;

			const handler = createHandler({
				onPermissionResponse: (id: string, approved: boolean, alwaysAllow?: boolean) => {
					receivedId = id;
					receivedApproved = approved;
					receivedAlwaysAllow = alwaysAllow;
				}
			});

			await handler.handleMessage({
				type: 'permissionResponse',
				requestId: 'req-123',
				approved: true,
				alwaysAllow: true
			});

			assert.strictEqual(receivedId, 'req-123');
			assert.strictEqual(receivedApproved, true);
			assert.strictEqual(receivedAlwaysAllow, true);
		});

		test('Should route userQuestionResponse with answers', async () => {
			let receivedId = '';
			let receivedAnswers: Record<string, string> = {};

			const handler = createHandler({
				onUserQuestionResponse: (id: string, answers: Record<string, string>) => {
					receivedId = id;
					receivedAnswers = answers;
				}
			});

			await handler.handleMessage({
				type: 'userQuestionResponse',
				requestId: 'question-456',
				answers: { 'q1': 'answer1', 'q2': 'answer2' }
			});

			assert.strictEqual(receivedId, 'question-456');
			assert.deepStrictEqual(receivedAnswers, { 'q1': 'answer1', 'q2': 'answer2' });
		});

		test('Should route openDiff with file details', async () => {
			let receivedPath = '';
			let receivedOld = '';
			let receivedNew = '';

			const handler = createHandler({
				onOpenDiff: (filePath: string, oldContent: string, newContent: string) => {
					receivedPath = filePath;
					receivedOld = oldContent;
					receivedNew = newContent;
				}
			});

			await handler.handleMessage({
				type: 'openDiff',
				filePath: '/src/test.ts',
				oldContent: 'const x = 1;',
				newContent: 'const x = 2;'
			});

			assert.strictEqual(receivedPath, '/src/test.ts');
			assert.strictEqual(receivedOld, 'const x = 1;');
			assert.strictEqual(receivedNew, 'const x = 2;');
		});

		test('Should route openFile with path', async () => {
			let receivedPath = '';

			const handler = createHandler({
				onOpenFile: (filePath: string) => { receivedPath = filePath; }
			});

			await handler.handleMessage({ type: 'openFile', filePath: '/src/index.ts' });

			assert.strictEqual(receivedPath, '/src/index.ts');
		});
	});

	suite('MCP Server Messages', () => {
		test('Should route loadMCPServers', async () => {
			let callbackCalled = false;

			const handler = createHandler({
				onLoadMCPServers: async () => { callbackCalled = true; }
			});

			await handler.handleMessage({ type: 'loadMCPServers' });

			assert.strictEqual(callbackCalled, true);
		});

		test('Should route saveMCPServer with name and config', async () => {
			let receivedName = '';
			let receivedConfig: any = null;

			const handler = createHandler({
				onSaveMCPServer: async (name: string, config: any) => {
					receivedName = name;
					receivedConfig = config;
				}
			});

			await handler.handleMessage({
				type: 'saveMCPServer',
				name: 'my-server',
				config: { command: 'node', args: ['server.js'] }
			});

			assert.strictEqual(receivedName, 'my-server');
			assert.deepStrictEqual(receivedConfig, { command: 'node', args: ['server.js'] });
		});

		test('Should route deleteMCPServer with name', async () => {
			let receivedName = '';

			const handler = createHandler({
				onDeleteMCPServer: async (name: string) => { receivedName = name; }
			});

			await handler.handleMessage({ type: 'deleteMCPServer', name: 'old-server' });

			assert.strictEqual(receivedName, 'old-server');
		});
	});

	suite('Permission Messages', () => {
		test('Should route sendPermissions', async () => {
			let callbackCalled = false;

			const handler = createHandler({
				onSendPermissions: async () => { callbackCalled = true; }
			});

			await handler.handleMessage({ type: 'sendPermissions' });

			assert.strictEqual(callbackCalled, true);
		});

		test('Should route removePermission', async () => {
			let receivedTool = '';
			let receivedCommand: string | null = null;

			const handler = createHandler({
				onRemovePermission: async (toolName: string, command: string | null) => {
					receivedTool = toolName;
					receivedCommand = command;
				}
			});

			await handler.handleMessage({
				type: 'removePermission',
				toolName: 'Bash',
				command: 'npm test'
			});

			assert.strictEqual(receivedTool, 'Bash');
			assert.strictEqual(receivedCommand, 'npm test');
		});

		test('Should route addPermission', async () => {
			let receivedTool = '';
			let receivedCommand: string | null = null;

			const handler = createHandler({
				onAddPermission: async (toolName: string, command: string | null) => {
					receivedTool = toolName;
					receivedCommand = command;
				}
			});

			await handler.handleMessage({
				type: 'addPermission',
				toolName: 'Read',
				command: '/src/*'
			});

			assert.strictEqual(receivedTool, 'Read');
			assert.strictEqual(receivedCommand, '/src/*');
		});
	});

	suite('Conversation Management Messages', () => {
		test('Should route getActiveConversations', async () => {
			let callbackCalled = false;

			const handler = createHandler({
				onGetActiveConversations: () => { callbackCalled = true; }
			});

			await handler.handleMessage({ type: 'getActiveConversations' });

			assert.strictEqual(callbackCalled, true);
		});

		test('Should route switchConversation', async () => {
			let receivedId = '';

			const handler = createHandler({
				onSwitchConversation: async (conversationId: string) => { receivedId = conversationId; }
			});

			await handler.handleMessage({ type: 'switchConversation', conversationId: 'conv-123' });

			assert.strictEqual(receivedId, 'conv-123');
		});

		test('Should route closeConversation', async () => {
			let receivedId = '';

			const handler = createHandler({
				onCloseConversation: async (conversationId: string) => { receivedId = conversationId; }
			});

			await handler.handleMessage({ type: 'closeConversation', conversationId: 'conv-456' });

			assert.strictEqual(receivedId, 'conv-456');
		});

		test('Should route openConversationInNewPanel', async () => {
			let receivedFilename = '';

			const handler = createHandler({
				onOpenConversationInNewPanel: async (filename: string) => { receivedFilename = filename; }
			});

			await handler.handleMessage({ type: 'openConversationInNewPanel', filename: 'conv.json' });

			assert.strictEqual(receivedFilename, 'conv.json');
		});
	});

	suite('Custom Snippets Messages', () => {
		test('Should route sendCustomSnippets', async () => {
			let callbackCalled = false;

			const handler = createHandler({
				onSendCustomSnippets: async () => { callbackCalled = true; }
			});

			await handler.handleMessage({ type: 'sendCustomSnippets' });

			assert.strictEqual(callbackCalled, true);
		});

		test('Should route saveCustomSnippet', async () => {
			let receivedSnippet: any = null;

			const handler = createHandler({
				onSaveCustomSnippet: async (snippet: any) => { receivedSnippet = snippet; }
			});

			await handler.handleMessage({
				type: 'saveCustomSnippet',
				snippet: { id: 'snip-1', name: 'Test', content: 'test content' }
			});

			assert.deepStrictEqual(receivedSnippet, { id: 'snip-1', name: 'Test', content: 'test content' });
		});

		test('Should route deleteCustomSnippet', async () => {
			let receivedId = '';

			const handler = createHandler({
				onDeleteCustomSnippet: async (snippetId: string) => { receivedId = snippetId; }
			});

			await handler.handleMessage({ type: 'deleteCustomSnippet', snippetId: 'snip-123' });

			assert.strictEqual(receivedId, 'snip-123');
		});
	});

	suite('Misc Messages', () => {
		test('Should route executeSlashCommand', async () => {
			let receivedCommand = '';

			const handler = createHandler({
				onExecuteSlashCommand: (command: string) => { receivedCommand = command; }
			});

			await handler.handleMessage({ type: 'executeSlashCommand', command: '/clear' });

			assert.strictEqual(receivedCommand, '/clear');
		});

		test('Should route saveInputText', async () => {
			let receivedText = '';

			const handler = createHandler({
				onSaveInputText: (text: string) => { receivedText = text; }
			});

			await handler.handleMessage({ type: 'saveInputText', text: 'draft message' });

			assert.strictEqual(receivedText, 'draft message');
		});

		test('Should route dismissWSLAlert', async () => {
			let callbackCalled = false;

			const handler = createHandler({
				onDismissWSLAlert: () => { callbackCalled = true; }
			});

			await handler.handleMessage({ type: 'dismissWSLAlert' });

			assert.strictEqual(callbackCalled, true);
		});

		test('Should handle message type as sendMessage alias', async () => {
			let receivedContent = '';

			const handler = createHandler({
				onSendMessage: async (text: string) => { receivedContent = text; }
			});

			await handler.handleMessage({ type: 'message', content: 'Hello from alias' });

			assert.strictEqual(receivedContent, 'Hello from alias');
		});
	});

	suite('Ignored Messages', () => {
		test('Should not throw on ready message', async () => {
			const handler = createHandler({});

			// Should not throw
			await handler.handleMessage({ type: 'ready' });
		});

		test('Should not throw on getPlatformInfo message', async () => {
			const handler = createHandler({});

			// Should not throw
			await handler.handleMessage({ type: 'getPlatformInfo' });
		});

		test('Should not throw on unknown message type', async () => {
			const handler = createHandler({});

			// Should not throw
			await handler.handleMessage({ type: 'unknownType', data: 'test' });
		});
	});
});

// Helper function to create handler with partial callbacks
function createHandler(partialCallbacks: Partial<Parameters<typeof WebviewMessageHandler['prototype']['handleMessage']>[0]>): WebviewMessageHandler {
	const defaultCallbacks = {
		onSendMessage: async () => {},
		onNewSession: async () => {},
		onStopRequest: async () => {},
		onLoadConversation: async () => {},
		onSetModel: () => {},
		onOpenModelTerminal: () => {},
		onOpenUsageTerminal: () => {},
		onRunInstallCommand: () => {},
		onExecuteSlashCommand: () => {},
		onOpenDiff: () => {},
		onOpenFile: () => {},
		onSelectImage: async () => {},
		onPermissionResponse: () => {},
		onUserQuestionResponse: () => {},
		onSaveInputText: () => {},
		onDismissWSLAlert: () => {},
		onSendPermissions: async () => {},
		onRemovePermission: async () => {},
		onAddPermission: async () => {},
		onLoadMCPServers: async () => {},
		onSaveMCPServer: async () => {},
		onDeleteMCPServer: async () => {},
		onSendCustomSnippets: async () => {},
		onSaveCustomSnippet: async () => {},
		onDeleteCustomSnippet: async () => {},
		onGetActiveConversations: () => {},
		onSwitchConversation: async () => {},
		onCloseConversation: async () => {},
		onOpenConversationInNewPanel: async () => {}
	};

	return new WebviewMessageHandler(mockContext as any, { ...defaultCallbacks, ...partialCallbacks });
}
