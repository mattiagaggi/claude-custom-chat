/**
 * StreamParser Unit Tests
 * Tests parsing of Claude's stream-json output format
 */

import * as assert from 'assert';
import { StreamParser, StreamCallbacks } from '../../src/handlers/StreamParser';

suite('StreamParser Tests', () => {

	suite('Basic Parsing', () => {
		test('Should parse single JSON line', () => {
			let received: any = null;
			const parser = new StreamParser({
				onTextDelta: (text) => { received = text; }
			});

			parser.parseChunk('{"type":"text_delta","text":"Hello"}\n');
			assert.strictEqual(received, 'Hello');
		});

		test('Should parse multiple JSON lines in one chunk', () => {
			const deltas: string[] = [];
			const parser = new StreamParser({
				onTextDelta: (text) => { deltas.push(text); }
			});

			parser.parseChunk('{"type":"text_delta","text":"Hello"}\n{"type":"text_delta","text":" World"}\n');
			assert.strictEqual(deltas.length, 2);
			assert.strictEqual(deltas[0], 'Hello');
			assert.strictEqual(deltas[1], ' World');
		});

		test('Should buffer incomplete lines', () => {
			const deltas: string[] = [];
			const parser = new StreamParser({
				onTextDelta: (text) => { deltas.push(text); }
			});

			// Send partial JSON
			parser.parseChunk('{"type":"text_delta","tex');
			assert.strictEqual(deltas.length, 0);

			// Complete the JSON
			parser.parseChunk('t":"Complete"}\n');
			assert.strictEqual(deltas.length, 1);
			assert.strictEqual(deltas[0], 'Complete');
		});

		test('Should handle empty lines', () => {
			const deltas: string[] = [];
			const parser = new StreamParser({
				onTextDelta: (text) => { deltas.push(text); }
			});

			parser.parseChunk('\n\n{"type":"text_delta","text":"Test"}\n\n');
			assert.strictEqual(deltas.length, 1);
		});

		test('Should handle malformed JSON gracefully', () => {
			const errors: string[] = [];
			const parser = new StreamParser({
				onError: (error) => { errors.push(error); }
			});

			// This should not throw
			parser.parseChunk('{ invalid json }\n');
			assert.strictEqual(errors.length, 0); // Errors are logged, not passed to callback
		});
	});

	suite('Message Type Routing', () => {
		test('Should route text_delta messages', () => {
			let called = false;
			const parser = new StreamParser({
				onTextDelta: () => { called = true; }
			});

			parser.parseChunk('{"type":"text_delta","text":"test"}\n');
			assert.strictEqual(called, true);
		});

		test('Should route tool_use messages', () => {
			let toolData: any = null;
			const parser = new StreamParser({
				onToolUse: (data) => { toolData = data; }
			});

			parser.parseChunk('{"type":"tool_use","name":"Bash","id":"tool-123"}\n');
			assert.ok(toolData);
		});

		test('Should route tool_result messages', () => {
			let resultData: any = null;
			const parser = new StreamParser({
				onToolResult: (data) => { resultData = data; }
			});

			parser.parseChunk('{"type":"tool_result","tool_use_id":"tool-123","content":"output"}\n');
			assert.ok(resultData);
		});

		test('Should route control_request messages', () => {
			let requestData: any = null;
			const parser = new StreamParser({
				onControlRequest: (data) => { requestData = data; }
			});

			const controlRequest = JSON.stringify({
				type: 'control_request',
				request_id: 'req-123',
				tool_name: 'Bash',
				input: { command: 'ls' }
			});
			parser.parseChunk(controlRequest + '\n');

			assert.ok(requestData);
			assert.strictEqual(requestData.type, 'control_request');
			assert.strictEqual(requestData.request_id, 'req-123');
		});

		test('Should route control_response messages', () => {
			let responseData: any = null;
			const parser = new StreamParser({
				onControlResponse: (data) => { responseData = data; }
			});

			parser.parseChunk('{"type":"control_response","request_id":"req-123"}\n');
			assert.ok(responseData);
		});

		test('Should route account_info messages', () => {
			let accountData: any = null;
			const parser = new StreamParser({
				onAccountInfo: (data) => { accountData = data; }
			});

			parser.parseChunk('{"type":"account_info","plan":"pro"}\n');
			assert.ok(accountData);
			assert.strictEqual(accountData.plan, 'pro');
		});

		test('Should route error messages', () => {
			let errorMsg: string | null = null;
			const parser = new StreamParser({
				onError: (error) => { errorMsg = error; }
			});

			parser.parseChunk('{"type":"error","message":"Something went wrong"}\n');
			assert.strictEqual(errorMsg, 'Something went wrong');
		});
	});

	suite('Session Handling', () => {
		test('Should trigger onSessionStart with session_id', () => {
			let sessionId: string | null = null;
			const parser = new StreamParser({
				onSessionStart: (id) => { sessionId = id; }
			});

			parser.parseChunk('{"session_id":"sess-abc123"}\n');
			assert.strictEqual(sessionId, 'sess-abc123');
		});

		test('Should only trigger session start once', () => {
			let callCount = 0;
			const parser = new StreamParser({
				onSessionStart: () => { callCount++; }
			});

			parser.parseChunk('{"session_id":"sess-1"}\n');
			parser.parseChunk('{"session_id":"sess-1","type":"text_delta","text":"hi"}\n');
			assert.strictEqual(callCount, 1);
		});
	});

	suite('Result Message Handling', () => {
		test('Should extract token usage from result', () => {
			let inputTokens = 0;
			let outputTokens = 0;
			const parser = new StreamParser({
				onTokenUsage: (input, output) => {
					inputTokens = input;
					outputTokens = output;
				}
			});

			parser.parseChunk('{"type":"result","input_tokens":100,"output_tokens":50}\n');
			assert.strictEqual(inputTokens, 100);
			assert.strictEqual(outputTokens, 50);
		});

		test('Should extract cost from result', () => {
			let cost = 0;
			const parser = new StreamParser({
				onCostUpdate: (c) => { cost = c; }
			});

			parser.parseChunk('{"type":"result","total_cost_usd":0.0025}\n');
			assert.strictEqual(cost, 0.0025);
		});

		test('Should trigger onResult callback', () => {
			let resultData: any = null;
			const parser = new StreamParser({
				onResult: (data) => { resultData = data; }
			});

			parser.parseChunk('{"type":"result","input_tokens":100,"output_tokens":50,"total_cost_usd":0.01}\n');
			assert.ok(resultData);
			assert.strictEqual(resultData.input_tokens, 100);
		});

		test('Should extract result text when present', () => {
			let message: string | null = null;
			const parser = new StreamParser({
				onMessage: (content) => { message = content; }
			});

			parser.parseChunk('{"type":"result","result":"Final answer here"}\n');
			assert.strictEqual(message, 'Final answer here');
		});
	});

	suite('Assistant Message Handling', () => {
		test('Should extract text from assistant message content', () => {
			let message: string | null = null;
			const parser = new StreamParser({
				onMessage: (content) => { message = content; }
			});

			const assistantMsg = JSON.stringify({
				type: 'assistant',
				message: {
					content: [
						{ type: 'text', text: 'Hello, how can I help?' }
					]
				}
			});
			parser.parseChunk(assistantMsg + '\n');
			assert.strictEqual(message, 'Hello, how can I help?');
		});

		test('Should extract tool_use from assistant message content', () => {
			let toolData: any = null;
			const parser = new StreamParser({
				onToolUse: (data) => { toolData = data; }
			});

			const assistantMsg = JSON.stringify({
				type: 'assistant',
				message: {
					content: [
						{ type: 'tool_use', name: 'Read', id: 'tool-456', input: { file_path: '/test.ts' } }
					]
				}
			});
			parser.parseChunk(assistantMsg + '\n');

			assert.ok(toolData);
			assert.strictEqual(toolData.toolName, 'Read');
			assert.strictEqual(toolData.id, 'tool-456');
		});
	});

	suite('Text Delta Accumulation', () => {
		test('Should accumulate text deltas', () => {
			const parser = new StreamParser({});

			parser.parseChunk('{"type":"text_delta","text":"Hello"}\n');
			parser.parseChunk('{"type":"text_delta","text":" World"}\n');

			assert.strictEqual(parser.getCurrentMessage(), 'Hello World');
		});

		test('Should reset accumulation on message type', () => {
			let finalMessage: string | null = null;
			const parser = new StreamParser({
				onMessage: (content) => { finalMessage = content; }
			});

			parser.parseChunk('{"type":"text_delta","text":"Hello"}\n');
			parser.parseChunk('{"type":"text_delta","text":" World"}\n');
			parser.parseChunk('{"type":"message"}\n');

			assert.strictEqual(finalMessage, 'Hello World');
			assert.strictEqual(parser.getCurrentMessage(), '');
		});
	});

	suite('Parser State Management', () => {
		test('Should reset parser state', () => {
			const parser = new StreamParser({});

			parser.parseChunk('{"type":"text_delta","text":"Hello"}\n');
			assert.strictEqual(parser.getCurrentMessage(), 'Hello');

			parser.reset();
			assert.strictEqual(parser.getCurrentMessage(), '');
		});
	});

	suite('Control Request Formats', () => {
		test('Should handle nested request format', () => {
			let requestData: any = null;
			const parser = new StreamParser({
				onControlRequest: (data) => { requestData = data; }
			});

			const nestedFormat = JSON.stringify({
				type: 'control_request',
				request_id: 'req-nested',
				request: {
					tool_name: 'Bash',
					input: { command: 'npm install' }
				}
			});
			parser.parseChunk(nestedFormat + '\n');

			assert.ok(requestData);
			assert.strictEqual(requestData.request_id, 'req-nested');
			assert.strictEqual(requestData.request.tool_name, 'Bash');
		});

		test('Should handle flat request format', () => {
			let requestData: any = null;
			const parser = new StreamParser({
				onControlRequest: (data) => { requestData = data; }
			});

			const flatFormat = JSON.stringify({
				type: 'control_request',
				request_id: 'req-flat',
				tool_name: 'Read',
				input: { file_path: '/test.ts' }
			});
			parser.parseChunk(flatFormat + '\n');

			assert.ok(requestData);
			assert.strictEqual(requestData.request_id, 'req-flat');
			assert.strictEqual(requestData.tool_name, 'Read');
		});
	});

	suite('Mixed Stream Processing', () => {
		test('Should handle mixed message types in stream', () => {
			const results = {
				textDeltas: [] as string[],
				toolUses: [] as any[],
				controlRequests: [] as any[]
			};

			const parser = new StreamParser({
				onTextDelta: (text) => results.textDeltas.push(text),
				onToolUse: (data) => results.toolUses.push(data),
				onControlRequest: (data) => results.controlRequests.push(data)
			});

			const mixedStream = [
				'{"type":"text_delta","text":"Starting..."}',
				'{"type":"tool_use","name":"Bash","id":"t1"}',
				'{"type":"control_request","request_id":"r1","tool_name":"Bash","input":{"command":"ls"}}',
				'{"type":"text_delta","text":"Done"}'
			].join('\n') + '\n';

			parser.parseChunk(mixedStream);

			assert.strictEqual(results.textDeltas.length, 2);
			assert.strictEqual(results.toolUses.length, 1);
			assert.strictEqual(results.controlRequests.length, 1);
		});
	});
});
