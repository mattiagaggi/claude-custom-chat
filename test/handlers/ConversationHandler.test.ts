/**
 * ConversationHandler Unit Tests
 * Tests conversation switching, loading, and active conversation management
 */

import * as assert from 'assert';
import { ConversationHandler, ConversationHandlerConfig } from '../../src/handlers/ConversationHandler';

// Mock ConversationManager
class MockConversationManager {
	private conversations: Map<string, any> = new Map();
	private activeConversationId: string = 'conv-1';
	private conversationList: any[] = [];
	private session = {
		sessionId: 'session-1',
		totalTokensInput: 100,
		totalTokensOutput: 50,
		totalCost: 0.01,
		messageCount: 5
	};

	addConversation(id: string, data: any): void {
		this.conversations.set(id, data);
	}

	getConversation(id: string): any {
		return this.conversations.get(id);
	}

	getActiveConversationId(): string {
		return this.activeConversationId;
	}

	setActiveConversationId(id: string): void {
		this.activeConversationId = id;
	}

	getActiveConversationIds(): string[] {
		return Array.from(this.conversations.keys());
	}

	switchConversation(id: string): boolean {
		if (!this.conversations.has(id)) {
			return false;
		}
		this.activeConversationId = id;
		return true;
	}

	async saveConversation(_id?: string): Promise<void> {
		// Mock save
	}

	async loadConversation(filename: string): Promise<any> {
		// Find conversation by filename
		for (const [id, conv] of this.conversations) {
			if (conv.filename === filename) {
				this.activeConversationId = id;
				return conv;
			}
		}
		return null;
	}

	getConversationList(): any[] {
		return this.conversationList;
	}

	setConversationList(list: any[]): void {
		this.conversationList = list;
	}

	getConversationIdForFilename(filename: string): string | undefined {
		for (const [id, conv] of this.conversations) {
			if (conv.filename === filename) {
				return id;
			}
		}
		return undefined;
	}

	getCurrentSession(): any {
		return this.session;
	}

	removeConversation(id: string): void {
		this.conversations.delete(id);
	}

	isConversationRunning(_id: string): boolean {
		return false;
	}
}

// Mock ProcessManager
class MockProcessManager {
	private runningConversations: Set<string> = new Set();

	isConversationRunning(id: string): boolean {
		return this.runningConversations.has(id);
	}

	async terminateConversation(_id: string): Promise<void> {
		// Mock terminate
	}

	setConversationRunning(id: string, running: boolean): void {
		if (running) {
			this.runningConversations.add(id);
		} else {
			this.runningConversations.delete(id);
		}
	}
}

suite('ConversationHandler Tests', () => {
	let mockConversationManager: MockConversationManager;
	let mockProcessManager: MockProcessManager;
	let postedMessages: any[];
	let currentConversationId: string | undefined;
	let processingConversationIds: Set<string>;
	let streamingTexts: Map<string, string>;
	let handler: ConversationHandler;

	setup(() => {
		mockConversationManager = new MockConversationManager();
		mockProcessManager = new MockProcessManager();
		postedMessages = [];
		currentConversationId = 'conv-1';
		processingConversationIds = new Set();
		streamingTexts = new Map();

		// Add default conversations
		mockConversationManager.addConversation('conv-1', {
			id: 'conv-1',
			filename: 'conv-1.json',
			sessionId: 'session-1',
			startTime: new Date().toISOString(),
			messages: [
				{ messageType: 'userInput', data: 'Hello Claude' },
				{ messageType: 'assistantMessage', data: 'Hello! How can I help?' }
			],
			totalCost: 0.01,
			totalTokensInput: 100,
			totalTokensOutput: 50,
			hasNewMessages: false
		});

		mockConversationManager.addConversation('conv-2', {
			id: 'conv-2',
			filename: 'conv-2.json',
			sessionId: 'session-2',
			startTime: new Date().toISOString(),
			messages: [
				{ messageType: 'userInput', data: 'Another conversation' }
			],
			totalCost: 0.005,
			totalTokensInput: 50,
			totalTokensOutput: 25,
			hasNewMessages: true
		});

		const config: ConversationHandlerConfig = {
			conversationManager: mockConversationManager as any,
			processManager: mockProcessManager as any,
			postMessage: (msg) => postedMessages.push(msg),
			getCurrentConversationId: () => currentConversationId,
			setCurrentConversationId: (id) => { currentConversationId = id; },
			getProcessingConversationId: () => {
				if (currentConversationId && processingConversationIds.has(currentConversationId)) {
					return currentConversationId;
				}
				return undefined;
			},
			isProcessing: () => processingConversationIds.size > 0,
			getStreamingText: (id) => streamingTexts.get(id),
			getProcessingConversationIds: () => processingConversationIds
		};

		handler = new ConversationHandler(config);
	});

	suite('sendActiveConversations', () => {
		test('Should send list of active conversations', () => {
			handler.sendActiveConversations();

			const listMessages = postedMessages.filter(m => m.type === 'activeConversationsList');
			assert.strictEqual(listMessages.length, 1);
			assert.ok(Array.isArray(listMessages[0].data));
		});

		test('Should include conversation details', () => {
			handler.sendActiveConversations();

			const listMessage = postedMessages.find(m => m.type === 'activeConversationsList');
			const conversations = listMessage.data;

			assert.ok(conversations.length >= 2);

			const conv1 = conversations.find((c: any) => c.id === 'conv-1');
			assert.ok(conv1);
			assert.strictEqual(conv1.title, 'Hello Claude');
			assert.strictEqual(conv1.isActive, true);
		});

		test('Should mark processing conversations', () => {
			processingConversationIds.add('conv-2');

			handler.sendActiveConversations();

			const listMessage = postedMessages.find(m => m.type === 'activeConversationsList');
			const conv2 = listMessage.data.find((c: any) => c.id === 'conv-2');

			assert.strictEqual(conv2.isProcessing, true);
		});

		test('Should generate title from first user message', () => {
			mockConversationManager.addConversation('conv-3', {
				id: 'conv-3',
				filename: 'conv-3.json',
				messages: [
					{ messageType: 'userInput', data: 'This is a very long message that should be truncated' }
				],
				hasNewMessages: false
			});

			handler.sendActiveConversations();

			const listMessage = postedMessages.find(m => m.type === 'activeConversationsList');
			const conv3 = listMessage.data.find((c: any) => c.id === 'conv-3');

			assert.ok(conv3.title.length <= 33); // 30 chars + "..."
			assert.ok(conv3.title.endsWith('...'));
		});

		test('Should show "New Chat" for conversations without messages', () => {
			mockConversationManager.addConversation('conv-empty', {
				id: 'conv-empty',
				filename: 'conv-empty.json',
				messages: [],
				hasNewMessages: false
			});

			handler.sendActiveConversations();

			const listMessage = postedMessages.find(m => m.type === 'activeConversationsList');
			const convEmpty = listMessage.data.find((c: any) => c.id === 'conv-empty');

			assert.strictEqual(convEmpty.title, 'New Chat');
		});
	});

	suite('switchConversation', () => {
		test('Should switch to different conversation', async () => {
			currentConversationId = 'conv-1';

			await handler.switchConversation('conv-2');

			assert.strictEqual(currentConversationId, 'conv-2');
		});

		test('Should not switch if already active', async () => {
			currentConversationId = 'conv-1';
			postedMessages.length = 0;

			await handler.switchConversation('conv-1');

			// Should not post any messages
			assert.strictEqual(postedMessages.length, 0);
		});

		test('Should send conversationLoaded message', async () => {
			await handler.switchConversation('conv-2');

			const loadedMessages = postedMessages.filter(m => m.type === 'conversationLoaded');
			assert.strictEqual(loadedMessages.length, 1);
			assert.strictEqual(loadedMessages[0].data.conversationId, 'conv-2');
		});

		test('Should include token info in loaded message', async () => {
			await handler.switchConversation('conv-2');

			const loadedMessage = postedMessages.find(m => m.type === 'conversationLoaded');
			assert.ok(loadedMessage.data.totalTokens);
			assert.strictEqual(loadedMessage.data.totalTokens.input, 50);
			assert.strictEqual(loadedMessage.data.totalTokens.output, 25);
		});

		test('Should send sessionInfo message', async () => {
			await handler.switchConversation('conv-2');

			const sessionMessages = postedMessages.filter(m => m.type === 'sessionInfo');
			assert.strictEqual(sessionMessages.length, 1);
		});

		test('Should send conversationSwitched notification', async () => {
			await handler.switchConversation('conv-2');

			const switchedMessages = postedMessages.filter(m => m.type === 'conversationSwitched');
			assert.strictEqual(switchedMessages.length, 1);
			assert.strictEqual(switchedMessages[0].conversationId, 'conv-2');
		});

		test('Should set processing state if conversation is processing', async () => {
			processingConversationIds.add('conv-2');

			await handler.switchConversation('conv-2');

			const processingMessages = postedMessages.filter(m => m.type === 'setProcessing');
			const processingOn = processingMessages.find(m => m.data.isProcessing === true);
			assert.ok(processingOn);
		});

		test('Should include streaming text if conversation is processing', async () => {
			processingConversationIds.add('conv-2');
			streamingTexts.set('conv-2', 'Streaming content...');

			await handler.switchConversation('conv-2');

			const loadedMessage = postedMessages.find(m => m.type === 'conversationLoaded');
			assert.strictEqual(loadedMessage.data.streamingText, 'Streaming content...');
		});
	});

	suite('closeConversation', () => {
		test('Should remove conversation from manager', async () => {
			let newSessionCalled = false;

			await handler.closeConversation('conv-2', async () => {
				newSessionCalled = true;
			});

			assert.strictEqual(mockConversationManager.getConversation('conv-2'), undefined);
		});

		test('Should switch to another conversation when closing active', async () => {
			currentConversationId = 'conv-1';

			await handler.closeConversation('conv-1', async () => {});

			// Should have switched to conv-2
			assert.strictEqual(currentConversationId, 'conv-2');
		});

		test('Should call newSessionCallback when closing last conversation', async () => {
			// Remove conv-2 first
			mockConversationManager.removeConversation('conv-2');
			currentConversationId = 'conv-1';

			let newSessionCalled = false;
			await handler.closeConversation('conv-1', async () => {
				newSessionCalled = true;
			});

			assert.strictEqual(newSessionCalled, true);
		});

		test('Should send updated active conversations list', async () => {
			await handler.closeConversation('conv-2', async () => {});

			const listMessages = postedMessages.filter(m => m.type === 'activeConversationsList');
			assert.ok(listMessages.length > 0);
		});
	});

	suite('loadConversation', () => {
		test('Should load conversation by filename', async () => {
			mockConversationManager.setConversationList([
				{ filename: 'conv-1.json', title: 'Conv 1' },
				{ filename: 'conv-2.json', title: 'Conv 2' }
			]);

			await handler.loadConversation('conv-2.json', {
				isProcessing: false,
				processingConversationId: undefined
			});

			assert.strictEqual(currentConversationId, 'conv-2');
		});

		test('Should send conversationLoaded message', async () => {
			await handler.loadConversation('conv-2.json', {
				isProcessing: false,
				processingConversationId: undefined
			});

			const loadedMessages = postedMessages.filter(m => m.type === 'conversationLoaded');
			assert.ok(loadedMessages.length > 0);
		});

		test('Should set processing state to false for non-processing conversation', async () => {
			await handler.loadConversation('conv-2.json', {
				isProcessing: false,
				processingConversationId: undefined
			});

			const processingMessages = postedMessages.filter(m => m.type === 'setProcessing');
			const lastProcessing = processingMessages[processingMessages.length - 1];
			assert.strictEqual(lastProcessing.data.isProcessing, false);
		});

		test('Should use in-memory state for currently processing conversation', async () => {
			processingConversationIds.add('conv-2');
			streamingTexts.set('conv-2', 'In-progress text...');

			await handler.loadConversation('conv-2.json', {
				isProcessing: true,
				processingConversationId: 'conv-2'
			});

			const loadedMessage = postedMessages.find(m => m.type === 'conversationLoaded');
			assert.strictEqual(loadedMessage.data.streamingText, 'In-progress text...');
		});

		test('Should send session info after loading', async () => {
			await handler.loadConversation('conv-2.json', {
				isProcessing: false,
				processingConversationId: undefined
			});

			const sessionMessages = postedMessages.filter(m => m.type === 'sessionInfo');
			assert.ok(sessionMessages.length > 0);
		});

		test('Should update conversation list after loading', async () => {
			await handler.loadConversation('conv-2.json', {
				isProcessing: false,
				processingConversationId: undefined
			});

			const listMessages = postedMessages.filter(m => m.type === 'conversationList');
			assert.ok(listMessages.length > 0);
		});

		test('Should set processing state for processing conversation', async () => {
			processingConversationIds.add('conv-2');

			await handler.loadConversation('conv-2.json', {
				isProcessing: true,
				processingConversationId: 'conv-2'
			});

			const processingMessages = postedMessages.filter(m => m.type === 'setProcessing');
			const processingOn = processingMessages.find(m => m.data.isProcessing === true);
			assert.ok(processingOn);
		});
	});

	suite('Edge Cases', () => {
		test('Should handle missing conversation gracefully', async () => {
			await handler.switchConversation('nonexistent');

			// Should not crash, currentConversationId should remain unchanged
			assert.strictEqual(currentConversationId, 'conv-1');
		});

		test('Should handle conversation with no messages', async () => {
			mockConversationManager.addConversation('conv-empty', {
				id: 'conv-empty',
				filename: 'conv-empty.json',
				messages: [],
				hasNewMessages: false
			});

			await handler.switchConversation('conv-empty');

			const loadedMessage = postedMessages.find(m => m.type === 'conversationLoaded');
			assert.ok(loadedMessage);
			assert.deepStrictEqual(loadedMessage.data.messages, []);
		});

		test('Should handle null conversation on load', async () => {
			await handler.loadConversation('nonexistent.json', {
				isProcessing: false,
				processingConversationId: undefined
			});

			// Should not crash
			assert.ok(true);
		});

		test('Should include default context values', async () => {
			mockConversationManager.addConversation('conv-no-context', {
				id: 'conv-no-context',
				filename: 'conv-no-context.json',
				messages: [],
				hasNewMessages: false
				// No currentContextUsed or contextWindow
			});

			await handler.switchConversation('conv-no-context');

			const loadedMessage = postedMessages.find(m => m.type === 'conversationLoaded');
			assert.strictEqual(loadedMessage.data.currentContextUsed, 0);
			assert.strictEqual(loadedMessage.data.contextWindow, 200000);
		});
	});

	suite('Processing State Tracking', () => {
		test('Should mark multiple conversations as processing', () => {
			processingConversationIds.add('conv-1');
			processingConversationIds.add('conv-2');

			handler.sendActiveConversations();

			const listMessage = postedMessages.find(m => m.type === 'activeConversationsList');
			const conv1 = listMessage.data.find((c: any) => c.id === 'conv-1');
			const conv2 = listMessage.data.find((c: any) => c.id === 'conv-2');

			assert.strictEqual(conv1.isProcessing, true);
			assert.strictEqual(conv2.isProcessing, true);
		});

		test('Should distinguish active vs processing conversations', () => {
			currentConversationId = 'conv-1';
			processingConversationIds.add('conv-2');

			handler.sendActiveConversations();

			const listMessage = postedMessages.find(m => m.type === 'activeConversationsList');
			const conv1 = listMessage.data.find((c: any) => c.id === 'conv-1');
			const conv2 = listMessage.data.find((c: any) => c.id === 'conv-2');

			assert.strictEqual(conv1.isActive, true);
			assert.strictEqual(conv1.isProcessing, false);
			assert.strictEqual(conv2.isActive, false);
			assert.strictEqual(conv2.isProcessing, true);
		});
	});
});
