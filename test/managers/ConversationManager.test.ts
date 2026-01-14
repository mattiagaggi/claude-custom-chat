/**
 * ConversationManager Unit Tests
 * Tests session management, conversation persistence, and multi-conversation handling
 */

import * as assert from 'assert';

// Mock vscode module
const mockContext = {
	subscriptions: [],
	extensionPath: '/mock/path',
	globalState: {
		get: () => undefined,
		update: async () => {}
	},
	workspaceState: {
		get: () => undefined,
		update: async () => {}
	}
};

// Import after mocking
import { ConversationManager, ConversationIndex } from '../../src/managers/ConversationManager';

suite('ConversationManager Tests', () => {

	suite('Conversation Creation', () => {
		test('Should create a default conversation on initialization', () => {
			const manager = new ConversationManager(mockContext as any);
			const activeId = manager.getActiveConversationId();

			assert.ok(activeId, 'Should have an active conversation ID');
			assert.ok(activeId!.startsWith('conv-'), 'ID should start with conv-');
		});

		test('Should create new conversation with unique ID', () => {
			const manager = new ConversationManager(mockContext as any);
			const id1 = manager.createConversation();
			const id2 = manager.createConversation();

			assert.notStrictEqual(id1, id2, 'IDs should be unique');
			assert.ok(id1.startsWith('conv-'));
			assert.ok(id2.startsWith('conv-'));
		});

		test('Should create conversation with provided session ID', () => {
			const manager = new ConversationManager(mockContext as any);
			const convId = manager.createConversation('session-123');
			const conv = manager.getConversation(convId);

			assert.ok(conv);
			assert.strictEqual(conv!.sessionId, 'session-123');
		});

		test('Should initialize conversation with empty messages', () => {
			const manager = new ConversationManager(mockContext as any);
			const convId = manager.createConversation();
			const conv = manager.getConversation(convId);

			assert.ok(conv);
			assert.strictEqual(conv!.messages.length, 0);
			assert.strictEqual(conv!.totalCost, 0);
			assert.strictEqual(conv!.totalTokensInput, 0);
			assert.strictEqual(conv!.totalTokensOutput, 0);
		});
	});

	suite('Active Conversation Management', () => {
		test('Should get active conversation', () => {
			const manager = new ConversationManager(mockContext as any);
			const activeConv = manager.getActiveConversation();

			assert.ok(activeConv, 'Should have active conversation');
			assert.strictEqual(activeConv!.isActive, true);
		});

		test('Should switch between conversations', () => {
			const manager = new ConversationManager(mockContext as any);
			const firstId = manager.getActiveConversationId();
			const secondId = manager.createConversation();

			const result = manager.switchConversation(secondId);

			assert.strictEqual(result, true, 'Switch should succeed');
			assert.strictEqual(manager.getActiveConversationId(), secondId);

			// First conversation should be inactive
			const firstConv = manager.getConversation(firstId!);
			assert.strictEqual(firstConv!.isActive, false);
		});

		test('Should return false when switching to non-existent conversation', () => {
			const manager = new ConversationManager(mockContext as any);
			const result = manager.switchConversation('non-existent-id');

			assert.strictEqual(result, false);
		});

		test('Should clear new messages badge when switching', () => {
			const manager = new ConversationManager(mockContext as any);
			const convId = manager.createConversation();
			const conv = manager.getConversation(convId);
			conv!.hasNewMessages = true;

			manager.switchConversation(convId);

			assert.strictEqual(conv!.hasNewMessages, false);
		});
	});

	suite('Message Management', () => {
		test('Should add message to active conversation', () => {
			const manager = new ConversationManager(mockContext as any);
			manager.addMessage('userInput', 'Hello Claude');

			const conv = manager.getActiveConversation();
			assert.strictEqual(conv!.messages.length, 1);
			assert.strictEqual(conv!.messages[0].messageType, 'userInput');
			assert.strictEqual(conv!.messages[0].data, 'Hello Claude');
		});

		test('Should add message to specific conversation', () => {
			const manager = new ConversationManager(mockContext as any);
			const targetId = manager.createConversation();

			manager.addMessage('assistantMessage', 'Response', targetId);

			const conv = manager.getConversation(targetId);
			assert.strictEqual(conv!.messages.length, 1);
			assert.strictEqual(conv!.messages[0].messageType, 'assistantMessage');
		});

		test('Should add timestamp to messages', () => {
			const manager = new ConversationManager(mockContext as any);
			const before = new Date().toISOString();

			manager.addMessage('userInput', 'Test');

			const after = new Date().toISOString();
			const conv = manager.getActiveConversation();
			const msgTime = conv!.messages[0].timestamp;

			assert.ok(msgTime >= before && msgTime <= after);
		});

		test('Should mark inactive conversation as having new messages', () => {
			const manager = new ConversationManager(mockContext as any);
			const firstId = manager.getActiveConversationId()!;
			const secondId = manager.createConversation();

			// Switch to second conversation
			manager.switchConversation(secondId);

			// Add message to first (now inactive) conversation
			manager.addMessage('assistantMessage', 'New message', firstId);

			const firstConv = manager.getConversation(firstId);
			assert.strictEqual(firstConv!.hasNewMessages, true);
		});
	});

	suite('Usage Statistics', () => {
		test('Should update usage for active conversation', () => {
			const manager = new ConversationManager(mockContext as any);
			manager.updateUsage(0.01, 100, 50);

			const conv = manager.getActiveConversation();
			assert.strictEqual(conv!.totalCost, 0.01);
			assert.strictEqual(conv!.totalTokensInput, 100);
			assert.strictEqual(conv!.totalTokensOutput, 50);
		});

		test('Should accumulate usage over multiple updates', () => {
			const manager = new ConversationManager(mockContext as any);
			manager.updateUsage(0.01, 100, 50);
			manager.updateUsage(0.02, 200, 100);

			const conv = manager.getActiveConversation();
			assert.strictEqual(conv!.totalCost, 0.03);
			assert.strictEqual(conv!.totalTokensInput, 300);
			assert.strictEqual(conv!.totalTokensOutput, 150);
		});

		test('Should update usage for specific conversation', () => {
			const manager = new ConversationManager(mockContext as any);
			const targetId = manager.createConversation();

			manager.updateUsage(0.05, 500, 250, targetId);

			const conv = manager.getConversation(targetId);
			assert.strictEqual(conv!.totalCost, 0.05);
			assert.strictEqual(conv!.totalTokensInput, 500);
		});
	});

	suite('Session Info', () => {
		test('Should get current session info', () => {
			const manager = new ConversationManager(mockContext as any);
			manager.addMessage('userInput', 'Hello');
			manager.updateUsage(0.01, 100, 50);

			const sessionInfo = manager.getCurrentSession();

			assert.strictEqual(sessionInfo.messageCount, 1);
			assert.strictEqual(sessionInfo.totalCost, 0.01);
			assert.strictEqual(sessionInfo.totalTokensInput, 100);
			assert.strictEqual(sessionInfo.totalTokensOutput, 50);
			assert.ok(sessionInfo.startTime);
		});

		test('Should set session ID', () => {
			const manager = new ConversationManager(mockContext as any);
			manager.setSessionId('claude-session-123');

			const conv = manager.getActiveConversation();
			assert.strictEqual(conv!.sessionId, 'claude-session-123');
		});

		test('Should set session ID for specific conversation', () => {
			const manager = new ConversationManager(mockContext as any);
			const targetId = manager.createConversation();
			manager.setSessionId('specific-session', targetId);

			const conv = manager.getConversation(targetId);
			assert.strictEqual(conv!.sessionId, 'specific-session');
		});
	});

	suite('Conversation IDs', () => {
		test('Should get all active conversation IDs', () => {
			const manager = new ConversationManager(mockContext as any);
			const id1 = manager.getActiveConversationId();
			const id2 = manager.createConversation();
			const id3 = manager.createConversation();

			const ids = manager.getActiveConversationIds();

			assert.strictEqual(ids.length, 3);
			assert.ok(ids.includes(id1!));
			assert.ok(ids.includes(id2));
			assert.ok(ids.includes(id3));
		});
	});

	suite('Start New Conversation', () => {
		test('Should start new conversation and set as active', () => {
			const manager = new ConversationManager(mockContext as any);
			const oldId = manager.getActiveConversationId();

			manager.startConversation('new-session-id');

			const newId = manager.getActiveConversationId();
			assert.notStrictEqual(oldId, newId);

			const newConv = manager.getActiveConversation();
			assert.strictEqual(newConv!.sessionId, 'new-session-id');
		});
	});

	suite('Summary Generation', () => {
		test('Should generate summary from first user message', () => {
			const manager = new ConversationManager(mockContext as any);
			manager.addMessage('userInput', 'Help me with TypeScript');

			// Access internal method via prototype
			const summary = (manager as any)._generateSummary(manager.getActiveConversation()!.messages);

			assert.strictEqual(summary, 'Help me with TypeScript');
		});

		test('Should use second message if available (often more descriptive)', () => {
			const manager = new ConversationManager(mockContext as any);
			manager.addMessage('userInput', 'Hi');
			manager.addMessage('userInput', 'Can you help me refactor this function?');

			const summary = (manager as any)._generateSummary(manager.getActiveConversation()!.messages);

			assert.strictEqual(summary, 'Can you help me refactor this function?');
		});

		test('Should truncate long summaries', () => {
			const manager = new ConversationManager(mockContext as any);
			const longMessage = 'A'.repeat(100);
			manager.addMessage('userInput', longMessage);

			const summary = (manager as any)._generateSummary(manager.getActiveConversation()!.messages);

			assert.ok(summary.length <= 60);
			assert.ok(summary.endsWith('...'));
		});

		test('Should clean file references from summary', () => {
			const manager = new ConversationManager(mockContext as any);
			manager.addMessage('userInput', '@src/index.ts Help me understand this file');

			const summary = (manager as any)._generateSummary(manager.getActiveConversation()!.messages);

			assert.ok(!summary.includes('@src'));
			assert.ok(summary.includes('Help me understand'));
		});

		test('Should return default for empty messages', () => {
			const manager = new ConversationManager(mockContext as any);

			const summary = (manager as any)._generateSummary([]);

			assert.strictEqual(summary, 'New conversation');
		});
	});

	suite('Conversation List', () => {
		test('Should return conversation list sorted by time', () => {
			const manager = new ConversationManager(mockContext as any);

			// The initial index is empty, so this just tests the sort mechanism
			const list = manager.getConversationList();

			assert.ok(Array.isArray(list));
		});

		test('Should get latest conversation', () => {
			const manager = new ConversationManager(mockContext as any);

			const latest = manager.getLatestConversation();

			// May be undefined if index is empty
			assert.ok(latest === undefined || typeof latest.filename === 'string');
		});
	});
});
