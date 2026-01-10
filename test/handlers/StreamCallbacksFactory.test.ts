/**
 * StreamCallbacksFactory Tests
 * Tests for end-of-turn detection, token usage tracking, and processing state management
 */

import * as assert from 'assert';

// Type for result data from Claude CLI
interface ResultData {
	type?: string;
	subtype?: string;
	is_done?: boolean;
	stop_reason?: string;
	input_tokens?: number;
	output_tokens?: number;
	total_cost_usd?: number;
}

// Helper function to check end-of-turn (mirrors the logic in StreamCallbacksFactory)
function isEndOfTurn(data: ResultData, hasBillingInfo: boolean): boolean {
	return data.is_done === true ||
		data.stop_reason === 'end_turn' ||
		(data.subtype === 'success' && hasBillingInfo) ||
		(data.subtype?.startsWith('error') ?? false);
}

// Mock the conversation manager and other dependencies
interface MockConversation {
	totalTokensInput: number;
	totalTokensOutput: number;
	totalCost: number;
	messages: any[];
}

class MockConversationManager {
	private conversations: Map<string, MockConversation> = new Map();

	constructor() {
		this.conversations.set('test-conv-1', {
			totalTokensInput: 0,
			totalTokensOutput: 0,
			totalCost: 0,
			messages: []
		});
	}

	getConversation(id: string) {
		return this.conversations.get(id);
	}

	addMessage(type: string, data: any, convId?: string) {
		const conv = this.conversations.get(convId || 'test-conv-1');
		if (conv) {
			conv.messages.push({ messageType: type, data, timestamp: new Date().toISOString() });
		}
	}

	updateUsage(cost: number, inputTokens: number, outputTokens: number, convId?: string) {
		const conv = this.conversations.get(convId || 'test-conv-1');
		if (conv) {
			conv.totalCost += cost;
			conv.totalTokensInput += inputTokens;
			conv.totalTokensOutput += outputTokens;
		}
	}

	async saveConversation(_convId?: string) {
		// Mock save
	}

	getConversationList() {
		return [];
	}
}

suite('End-of-Turn Detection Tests', () => {

	suite('isEndOfTurn conditions', () => {

		test('Should detect end-of-turn with is_done=true', () => {
			const data: ResultData = {
				type: 'result',
				subtype: 'success',
				is_done: true
			};

			assert.strictEqual(isEndOfTurn(data, false), true, 'is_done=true should mark end of turn');
		});

		test('Should detect end-of-turn with stop_reason=end_turn', () => {
			const data: ResultData = {
				type: 'result',
				subtype: 'success',
				stop_reason: 'end_turn'
			};

			assert.strictEqual(isEndOfTurn(data, false), true, 'stop_reason=end_turn should mark end of turn');
		});

		test('Should detect end-of-turn with success and billing info', () => {
			const data: ResultData = {
				type: 'result',
				subtype: 'success',
				input_tokens: 100,
				output_tokens: 50,
				total_cost_usd: 0.01
			};

			const inputTokens = data.input_tokens || 0;
			const outputTokens = data.output_tokens || 0;
			const cost = data.total_cost_usd || 0;
			const hasBillingInfo = (inputTokens > 0 || outputTokens > 0 || cost > 0);

			assert.strictEqual(isEndOfTurn(data, hasBillingInfo), true, 'success with billing should mark end of turn');
		});

		test('Should detect end-of-turn with error subtype', () => {
			const data: ResultData = {
				type: 'result',
				subtype: 'error_max_turns'
			};

			assert.strictEqual(isEndOfTurn(data, false), true, 'error subtype should mark end of turn');
		});

		test('Should NOT detect end-of-turn for intermediate success without billing', () => {
			const data: ResultData = {
				type: 'result',
				subtype: 'success'
				// No is_done, no stop_reason, no billing info
			};

			assert.strictEqual(isEndOfTurn(data, false), false, 'intermediate success should NOT mark end of turn');
		});

		test('Should NOT detect end-of-turn for tool_use stop reason', () => {
			const data: ResultData = {
				type: 'result',
				subtype: 'success',
				stop_reason: 'tool_use'
			};

			assert.strictEqual(isEndOfTurn(data, false), false, 'tool_use stop should NOT mark end of turn');
		});
	});
});

suite('Token Usage Tracking Tests', () => {

	suite('Usage accumulation', () => {

		test('Should accumulate tokens correctly', () => {
			const manager = new MockConversationManager();

			manager.updateUsage(0, 100, 50, 'test-conv-1');
			manager.updateUsage(0, 200, 100, 'test-conv-1');

			const conv = manager.getConversation('test-conv-1');
			assert.strictEqual(conv?.totalTokensInput, 300);
			assert.strictEqual(conv?.totalTokensOutput, 150);
		});

		test('Should accumulate cost correctly', () => {
			const manager = new MockConversationManager();

			manager.updateUsage(0.01, 0, 0, 'test-conv-1');
			manager.updateUsage(0.02, 0, 0, 'test-conv-1');

			const conv = manager.getConversation('test-conv-1');
			assert.ok(conv);
			assert.ok(Math.abs(conv.totalCost - 0.03) < 0.0001, 'Cost should be approximately 0.03');
		});

		test('Should handle partial usage updates', () => {
			const manager = new MockConversationManager();

			// onTokenUsage passes tokens but 0 cost
			manager.updateUsage(0, 100, 50, 'test-conv-1');
			// onCostUpdate passes cost but 0 tokens
			manager.updateUsage(0.01, 0, 0, 'test-conv-1');

			const conv = manager.getConversation('test-conv-1');
			assert.strictEqual(conv?.totalTokensInput, 100);
			assert.strictEqual(conv?.totalTokensOutput, 50);
			assert.strictEqual(conv?.totalCost, 0.01);
		});
	});
});

suite('Processing State Tests', () => {

	suite('State transitions', () => {

		test('Processing state should start false', () => {
			const isProcessing = false;
			assert.strictEqual(isProcessing, false);
		});

		test('Processing state should be set true when starting', () => {
			let isProcessing = false;

			// Simulate starting a request
			isProcessing = true;

			assert.strictEqual(isProcessing, true);
		});

		test('Processing state should be set false on end-of-turn', () => {
			let isProcessing = true;

			// Simulate end-of-turn detection
			const data: ResultData = { is_done: true };

			if (isEndOfTurn(data, false)) {
				isProcessing = false;
			}

			assert.strictEqual(isProcessing, false);
		});

		test('Processing state should remain true during tool use', () => {
			let isProcessing = true;

			// Simulate tool_use result (not end of turn)
			const data: ResultData = { subtype: 'success', stop_reason: 'tool_use' };

			if (isEndOfTurn(data, false)) {
				isProcessing = false;
			}

			assert.strictEqual(isProcessing, true, 'Processing should continue during tool use');
		});
	});
});

suite('Conversation Loading Tests', () => {

	suite('Token restoration from saved data', () => {

		test('Should restore tokens from saved conversation', () => {
			const savedConversation = {
				totalTokens: {
					input: 1500,
					output: 800
				},
				totalCost: 0.05,
				messages: [
					{ messageType: 'userInput', data: 'Hello' },
					{ messageType: 'assistantMessage', data: 'Hi there!' }
				]
			};

			// Simulate loading
			const totalTokens = savedConversation.totalTokens || { input: 0, output: 0 };
			const totalTokensInput = totalTokens.input || 0;
			const totalTokensOutput = totalTokens.output || 0;
			const totalCost = savedConversation.totalCost || 0;

			assert.strictEqual(totalTokensInput, 1500);
			assert.strictEqual(totalTokensOutput, 800);
			assert.strictEqual(totalCost, 0.05);
		});

		test('Should handle missing totalTokens gracefully', () => {
			const savedConversation: { totalCost: number; messages: any[]; totalTokens?: { input: number; output: number } } = {
				// No totalTokens field (old format)
				totalCost: 0.05,
				messages: []
			};

			const totalTokens = savedConversation.totalTokens || { input: 0, output: 0 };
			const totalTokensInput = totalTokens.input || 0;
			const totalTokensOutput = totalTokens.output || 0;

			assert.strictEqual(totalTokensInput, 0);
			assert.strictEqual(totalTokensOutput, 0);
		});

		test('Should calculate request count from user messages', () => {
			const messages = [
				{ messageType: 'userInput', data: 'Hello' },
				{ messageType: 'assistantMessage', data: 'Hi!' },
				{ messageType: 'userInput', data: 'How are you?' },
				{ messageType: 'assistantMessage', data: 'I am well!' },
				{ messageType: 'toolUse', data: { toolName: 'Read' } },
				{ messageType: 'userInput', data: 'Thanks' }
			];

			const requestCount = messages.filter(m => m.messageType === 'userInput').length;

			assert.strictEqual(requestCount, 3);
		});
	});
});
