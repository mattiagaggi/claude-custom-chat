/**
 * Conversation Persistence Tests
 * Tests file I/O operations for saving and loading conversations
 */

import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ConversationManager } from '../../src/managers/ConversationManager';

suite('Conversation Persistence Tests', () => {
	let tempDir: string;
	let mockContext: any;

	setup(() => {
		// Create a temporary directory for each test
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'conv-test-'));

		// Mock vscode context with working storage
		const storage = new Map<string, any>();
		mockContext = {
			subscriptions: [],
			extensionPath: tempDir,
			globalStorageUri: { fsPath: tempDir },
			globalState: {
				get: (key: string) => storage.get(key),
				update: async (key: string, value: any) => { storage.set(key, value); }
			},
			workspaceState: {
				get: (key: string) => storage.get('ws_' + key),
				update: async (key: string, value: any) => { storage.set('ws_' + key, value); }
			}
		};
	});

	teardown(() => {
		// Clean up temp directory
		if (tempDir && fs.existsSync(tempDir)) {
			fs.rmSync(tempDir, { recursive: true, force: true });
		}
	});

	suite('Conversation Creation', () => {
		test('Should create a default conversation on initialization', () => {
			const manager = new ConversationManager(mockContext);
			const activeId = manager.getActiveConversationId();

			assert.ok(activeId !== undefined, 'Should have an active conversation ID');
		});

		test('Should create new conversations with unique IDs', () => {
			const manager = new ConversationManager(mockContext);
			const id1 = manager.getActiveConversationId();
			const id2 = manager.createConversation();
			const id3 = manager.createConversation();

			assert.notStrictEqual(id1, id2, 'Conversation IDs should be unique');
			assert.notStrictEqual(id2, id3, 'Conversation IDs should be unique');
			assert.notStrictEqual(id1, id3, 'Conversation IDs should be unique');
		});
	});

	suite('Message Storage', () => {
		test('Should add messages to active conversation', () => {
			const manager = new ConversationManager(mockContext);

			manager.addMessage('userInput', 'Test message 1');
			manager.addMessage('assistantResponse', 'Test response');
			manager.addMessage('userInput', 'Test message 2');

			const conversation = manager.getActiveConversation();
			assert.ok(conversation, 'Should have active conversation');
			assert.strictEqual(conversation!.messages.length, 3, 'Should have 3 messages');
		});

		test('Should preserve message order', () => {
			const manager = new ConversationManager(mockContext);

			manager.addMessage('userInput', 'First');
			manager.addMessage('assistantResponse', 'Second');
			manager.addMessage('userInput', 'Third');

			const conversation = manager.getActiveConversation();
			assert.ok(conversation, 'Should have active conversation');

			const contents = conversation!.messages.map(m => m.data);
			assert.strictEqual(contents[0], 'First');
			assert.strictEqual(contents[1], 'Second');
			assert.strictEqual(contents[2], 'Third');
		});

		test('Should handle special characters in messages', () => {
			const manager = new ConversationManager(mockContext);

			const specialContent = 'Test with 日本語 and emoji 🎉 and "quotes" and \\backslashes\\';
			manager.addMessage('userInput', specialContent);

			const conversation = manager.getActiveConversation();
			assert.ok(conversation, 'Should have active conversation');
			assert.strictEqual(conversation!.messages[0].data, specialContent);
		});
	});

	suite('Usage Tracking', () => {
		test('Should track usage statistics', () => {
			const manager = new ConversationManager(mockContext);

			manager.updateUsage(0.05, 100, 50);

			const session = manager.getCurrentSession();
			assert.strictEqual(session.totalCost, 0.05);
			assert.strictEqual(session.totalTokensInput, 100);
			assert.strictEqual(session.totalTokensOutput, 50);
		});

		test('Should accumulate usage across multiple updates', () => {
			const manager = new ConversationManager(mockContext);

			manager.updateUsage(0.05, 100, 50);
			manager.updateUsage(0.03, 200, 100);
			manager.updateUsage(0.02, 50, 25);

			const session = manager.getCurrentSession();
			assert.strictEqual(session.totalCost, 0.10);
			assert.strictEqual(session.totalTokensInput, 350);
			assert.strictEqual(session.totalTokensOutput, 175);
		});
	});

	suite('Multi-Conversation Management', () => {
		test('Should switch between conversations', () => {
			const manager = new ConversationManager(mockContext);

			const id1 = manager.getActiveConversationId();
			const id2 = manager.createConversation();

			manager.switchConversation(id2);
			assert.strictEqual(manager.getActiveConversationId(), id2);

			manager.switchConversation(id1!);
			assert.strictEqual(manager.getActiveConversationId(), id1);
		});

		test('Messages should be isolated between conversations', () => {
			const manager = new ConversationManager(mockContext);

			const id1 = manager.getActiveConversationId();
			manager.addMessage('userInput', 'Conversation 1 message');

			const id2 = manager.createConversation();
			manager.switchConversation(id2);
			manager.addMessage('userInput', 'Conversation 2 message');

			const conv1 = manager.getConversation(id1!);
			const conv2 = manager.getConversation(id2);

			assert.ok(conv1, 'Should have conversation 1');
			assert.ok(conv2, 'Should have conversation 2');

			const hasConv1Msg = conv1!.messages.some(m => m.data === 'Conversation 1 message');
			const hasConv2Msg = conv2!.messages.some(m => m.data === 'Conversation 2 message');
			const conv1HasConv2Msg = conv1!.messages.some(m => m.data === 'Conversation 2 message');

			assert.ok(hasConv1Msg, 'Conv1 should have its message');
			assert.ok(hasConv2Msg, 'Conv2 should have its message');
			assert.ok(!conv1HasConv2Msg, 'Conv1 should not have Conv2 message');
		});

		test('Should get all active conversation IDs', () => {
			const manager = new ConversationManager(mockContext);

			manager.createConversation();
			manager.createConversation();
			manager.createConversation();

			const ids = manager.getActiveConversationIds();
			assert.ok(ids.length >= 4, 'Should have at least 4 conversations (1 default + 3 created)');
		});
	});

	suite('Session ID Management', () => {
		test('Should set and get session ID', () => {
			const manager = new ConversationManager(mockContext);

			manager.setSessionId('test-session-123');

			const session = manager.getCurrentSession();
			assert.strictEqual(session.sessionId, 'test-session-123');
		});

		test('Should create conversation with session ID', () => {
			const manager = new ConversationManager(mockContext);

			const id = manager.createConversation('preset-session-id');
			manager.switchConversation(id);

			const session = manager.getCurrentSession();
			assert.strictEqual(session.sessionId, 'preset-session-id');
		});
	});

	suite('Conversation List', () => {
		test('Should return conversation list', () => {
			const manager = new ConversationManager(mockContext);

			// The list comes from saved conversations, so initially may be empty
			const list = manager.getConversationList();
			assert.ok(Array.isArray(list), 'Should return an array');
		});
	});

	suite('Edge Cases', () => {
		test('Should handle empty conversation gracefully', () => {
			const manager = new ConversationManager(mockContext);

			const conversation = manager.getActiveConversation();
			assert.ok(conversation, 'Should have active conversation');
			assert.ok(Array.isArray(conversation!.messages), 'Should have messages array');
		});

		test('Should handle switching to non-existent conversation', () => {
			const manager = new ConversationManager(mockContext);

			const result = manager.switchConversation('non-existent-id');
			assert.strictEqual(result, false, 'Should return false for non-existent ID');
		});

		test('Should handle large message history', () => {
			const manager = new ConversationManager(mockContext);

			// Add many messages
			for (let i = 0; i < 100; i++) {
				manager.addMessage(i % 2 === 0 ? 'userInput' : 'assistantResponse', `Message ${i}`);
			}

			const conversation = manager.getActiveConversation();
			assert.ok(conversation, 'Should have active conversation');
			assert.strictEqual(conversation!.messages.length, 100, 'Should have all 100 messages');
		});
	});
});
