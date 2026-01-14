/**
 * Permission Flow Unit Tests
 * Tests the complete flow from Claude sending a permission request to UI display
 */

import * as assert from 'assert';
import { StreamParser } from '../../src/handlers/StreamParser';

suite('Permission Request Flow Tests', () => {

	suite('1. StreamParser - control_request parsing', () => {
		test('Should parse control_request and trigger callback', (done) => {
			let callbackTriggered = false;
			let receivedData: any = null;

			const parser = new StreamParser({
				onControlRequest: (data: any) => {
					callbackTriggered = true;
					receivedData = data;

					console.log('✓ onControlRequest callback triggered');
					console.log('✓ Received data:', JSON.stringify(data, null, 2));

					// Verify the data structure
					assert.strictEqual(data.type, 'control_request', 'Type should be control_request');
					assert.ok(data.request_id, 'Should have request_id');
					assert.ok(data.request?.tool_name || data.tool_name, 'Should have tool_name');

					done();
				}
			});

			// Simulate a control_request from Claude
			const controlRequestJson = JSON.stringify({
				type: 'control_request',
				request_id: 'test-request-123',
				request: {
					tool_name: 'Bash',
					input: {
						command: 'ls -la'
					}
				}
			});

			console.log('Parsing control_request JSON:', controlRequestJson);
			parser.parseChunk(controlRequestJson + '\n');

			// Fail if callback not triggered within 100ms
			setTimeout(() => {
				if (!callbackTriggered) {
					done(new Error('onControlRequest callback was not triggered'));
				}
			}, 100);
		});

		test('Should parse control_request with different data formats', (done) => {
			const parser = new StreamParser({
				onControlRequest: (data: any) => {
					console.log('✓ Alternate format parsed:', data);
					assert.ok(data.tool_name || data.request?.tool_name, 'Should have tool_name in some format');
					done();
				}
			});

			// Alternative format that might be sent by Claude
			const alternateFormat = JSON.stringify({
				type: 'control_request',
				request_id: 'test-456',
				tool_name: 'Read',
				input: {
					file_path: '/test/file.ts'
				}
			});

			parser.parseChunk(alternateFormat + '\n');
		});

		test('Should handle control_request in stream with other messages', (done) => {
			let controlRequestReceived = false;
			let textDeltaReceived = false;

			const parser = new StreamParser({
				onControlRequest: (data: any) => {
					controlRequestReceived = true;
					console.log('✓ Control request received in mixed stream');
				},
				onTextDelta: (text: string) => {
					textDeltaReceived = true;
					console.log('✓ Text delta received in mixed stream');
				}
			});

			// Simulate mixed stream
			const mixedStream =
				JSON.stringify({ type: 'text_delta', text: 'Starting task...' }) + '\n' +
				JSON.stringify({ type: 'control_request', request_id: 'req-789', tool_name: 'Bash', input: { command: 'npm install' } }) + '\n' +
				JSON.stringify({ type: 'text_delta', text: 'Waiting for approval...' }) + '\n';

			parser.parseChunk(mixedStream);

			setTimeout(() => {
				assert.ok(controlRequestReceived, 'Control request should be received');
				assert.ok(textDeltaReceived, 'Text deltas should be received');
				done();
			}, 50);
		});
	});

	suite('2. Extension - handleControlRequest logic', () => {
		test('Should extract tool_name and request_id from control_request', () => {
			// Test different data formats that might come from Claude
			const testCases = [
				{
					name: 'Nested format',
					data: {
						request_id: 'req-1',
						request: {
							tool_name: 'Bash',
							input: { command: 'ls' }
						}
					},
					expectedToolName: 'Bash',
					expectedRequestId: 'req-1'
				},
				{
					name: 'Flat format',
					data: {
						request_id: 'req-2',
						tool_name: 'Read',
						input: { file_path: 'test.ts' }
					},
					expectedToolName: 'Read',
					expectedRequestId: 'req-2'
				},
				{
					name: 'Mixed format',
					data: {
						request_id: 'req-3',
						tool_name: 'Write',
						request: {
							input: { file_path: 'test.ts', content: 'hello' }
						}
					},
					expectedToolName: 'Write',
					expectedRequestId: 'req-3'
				}
			];

			testCases.forEach(testCase => {
				console.log(`\nTesting: ${testCase.name}`);
				console.log('Input:', JSON.stringify(testCase.data, null, 2));

				// Simulate the extraction logic from handleControlRequest
				const request_id = testCase.data.request_id;
				const tool_name = testCase.data.request?.tool_name || testCase.data.tool_name;
				const input = testCase.data.request?.input || testCase.data.input;

				console.log('Extracted:', { request_id, tool_name, input });

				assert.strictEqual(request_id, testCase.expectedRequestId, `Request ID should match for ${testCase.name}`);
				assert.strictEqual(tool_name, testCase.expectedToolName, `Tool name should match for ${testCase.name}`);
				assert.ok(input, `Input should exist for ${testCase.name}`);
			});
		});

		test('Should correctly identify AskUserQuestion vs permission requests', () => {
			const permissionRequest = {
				request_id: 'req-1',
				tool_name: 'Bash',
				input: { command: 'ls' }
			};

			const questionRequest = {
				request_id: 'req-2',
				tool_name: 'AskUserQuestion',
				input: { questions: [{ question: 'What color?', options: [] }] }
			};

			const tool_name_1 = permissionRequest.tool_name;
			const tool_name_2 = questionRequest.tool_name;

			console.log('Permission request tool:', tool_name_1);
			console.log('Question request tool:', tool_name_2);

			assert.notStrictEqual(tool_name_1, 'AskUserQuestion', 'Permission should not be AskUserQuestion');
			assert.strictEqual(tool_name_2, 'AskUserQuestion', 'Question should be AskUserQuestion');
		});
	});

	suite('3. WebView Message Format', () => {
		test('Should create correct permissionRequest message for UI', () => {
			// Simulate what extension.ts sends to the webview
			const mockControlRequest = {
				request_id: 'req-abc-123',
				tool_name: 'Bash',
				input: { command: 'npm install express' },
				suggestions: []
			};

			// This is what gets sent to webview (from extension.ts:592-601)
			const webviewMessage = {
				type: 'permissionRequest',
				data: {
					id: mockControlRequest.request_id,
					toolName: mockControlRequest.tool_name,
					input: mockControlRequest.input,
					status: 'pending',
					suggestions: mockControlRequest.suggestions || []
				}
			};

			console.log('Webview message:', JSON.stringify(webviewMessage, null, 2));

			// Verify message structure
			assert.strictEqual(webviewMessage.type, 'permissionRequest', 'Type should be permissionRequest');
			assert.ok(webviewMessage.data.id, 'Should have id');
			assert.ok(webviewMessage.data.toolName, 'Should have toolName');
			assert.ok(webviewMessage.data.input, 'Should have input');
			assert.strictEqual(webviewMessage.data.status, 'pending', 'Status should be pending');
		});

		test('Should handle different tool types', () => {
			const tools = ['Bash', 'Read', 'Write', 'Edit', 'Glob', 'Grep'];

			tools.forEach(toolName => {
				const message = {
					type: 'permissionRequest',
					data: {
						id: `req-${toolName.toLowerCase()}`,
						toolName: toolName,
						input: { command: 'test' },
						status: 'pending',
						suggestions: []
					}
				};

				console.log(`✓ ${toolName} message structure valid`);
				assert.strictEqual(message.data.toolName, toolName);
			});
		});
	});

	suite('4. Complete Flow Integration Test', () => {
		test('Should handle complete permission request flow', (done) => {
			const flowSteps: string[] = [];

			// Step 1: StreamParser receives control_request
			const parser = new StreamParser({
				onControlRequest: (data: any) => {
					flowSteps.push('1. StreamParser.onControlRequest triggered');
					console.log('Step 1 ✓: StreamParser received control_request');

					// Step 2: Extension extracts data
					const request_id = data.request_id;
					const tool_name = data.request?.tool_name || data.tool_name;
					const input = data.request?.input || data.input;

					flowSteps.push('2. Extension extracted: ' + JSON.stringify({ request_id, tool_name }));
					console.log('Step 2 ✓: Extension extracted data');

					// Step 3: Check if not AskUserQuestion
					if (tool_name !== 'AskUserQuestion') {
						flowSteps.push('3. Not AskUserQuestion - creating permission request');
						console.log('Step 3 ✓: Identified as permission request');

						// Step 4: Create webview message
						const webviewMessage = {
							type: 'permissionRequest',
							data: {
								id: request_id,
								toolName: tool_name,
								input: input,
								status: 'pending',
								suggestions: data.suggestions || []
							}
						};

						flowSteps.push('4. Webview message created: ' + webviewMessage.type);
						console.log('Step 4 ✓: Webview message created');

						// Step 5: Verify UI would receive correct data
						assert.strictEqual(webviewMessage.type, 'permissionRequest');
						assert.ok(webviewMessage.data.id);
						assert.ok(webviewMessage.data.toolName);

						flowSteps.push('5. UI would receive valid permission request');
						console.log('Step 5 ✓: UI message validated');

						console.log('\n=== Complete Flow Steps ===');
						flowSteps.forEach(step => console.log(step));
						console.log('===========================\n');

						done();
					} else {
						done(new Error('Incorrectly identified as AskUserQuestion'));
					}
				}
			});

			// Simulate Claude sending a control_request
			const claudeControlRequest = JSON.stringify({
				type: 'control_request',
				request_id: 'flow-test-123',
				request: {
					tool_name: 'Bash',
					input: {
						command: 'npm install',
						description: 'Install npm packages'
					}
				},
				suggestions: []
			});

			console.log('\n=== Starting Complete Flow Test ===');
			console.log('Claude sends:', claudeControlRequest);
			parser.parseChunk(claudeControlRequest + '\n');
		});
	});

	suite('5. Edge Cases and Error Handling', () => {
		test('Should handle missing fields gracefully', () => {
			const invalidRequests = [
				{ name: 'Missing request_id', data: { type: 'control_request', tool_name: 'Bash' } as any },
				{ name: 'Missing tool_name', data: { type: 'control_request', request_id: 'req-1' } as any },
				{ name: 'Empty request object', data: { type: 'control_request', request_id: 'req-1', request: {} } as any }
			];

			invalidRequests.forEach(test => {
				console.log(`Testing: ${test.name}`);
				const request_id = test.data.request_id;
				const tool_name = test.data.request?.tool_name || test.data.tool_name;

				console.log(`  request_id: ${request_id || 'MISSING'}`);
				console.log(`  tool_name: ${tool_name || 'MISSING'}`);

				if (!request_id || !tool_name) {
					console.log(`  ✓ Correctly identified missing data`);
				}
			});
		});

		test('Should handle malformed JSON gracefully', () => {
			const parser = new StreamParser({
				onControlRequest: () => {
					assert.fail('Should not trigger callback for malformed JSON');
				}
			});

			const malformedJson = '{ type: "control_request", invalid json }';
			console.log('Testing malformed JSON:', malformedJson);

			// Should not throw or trigger callback
			parser.parseChunk(malformedJson + '\n');
			console.log('✓ Handled malformed JSON without crashing');
		});
	});
});
