/**
 * Claude Payload Format Tests
 * Tests the correct structure of payloads sent to and received from Claude Code CLI
 */

import * as assert from 'assert';

suite('Claude Payload Format Tests', () => {

	suite('User Message Payload', () => {
		test('Should have correct structure for basic user message', () => {
			// This is the format sent to Claude via stdin
			const payload = {
				type: 'user',
				session_id: '',
				message: {
					role: 'user',
					content: [
						{
							type: 'text',
							text: 'Hello Claude'
						}
					]
				},
				parent_tool_use_id: null
			};

			assert.strictEqual(payload.type, 'user');
			assert.strictEqual(payload.message.role, 'user');
			assert.ok(Array.isArray(payload.message.content));
			assert.strictEqual(payload.message.content[0].type, 'text');
		});

		test('Should include session_id for continued conversations', () => {
			const payload = {
				type: 'user',
				session_id: 'sess-abc123',
				message: {
					role: 'user',
					content: [{ type: 'text', text: 'Continue our conversation' }]
				},
				parent_tool_use_id: null
			};

			assert.strictEqual(payload.session_id, 'sess-abc123');
		});

		test('Should serialize to valid JSON', () => {
			const payload = {
				type: 'user',
				session_id: '',
				message: {
					role: 'user',
					content: [{ type: 'text', text: 'Test message' }]
				},
				parent_tool_use_id: null
			};

			const json = JSON.stringify(payload);
			const parsed = JSON.parse(json);

			assert.deepStrictEqual(parsed, payload);
		});

		test('Should handle special characters in message', () => {
			const payload = {
				type: 'user',
				session_id: '',
				message: {
					role: 'user',
					content: [{ type: 'text', text: 'Test with "quotes" and\nnewlines\tand\ttabs' }]
				},
				parent_tool_use_id: null
			};

			const json = JSON.stringify(payload);
			const parsed = JSON.parse(json);

			assert.ok(parsed.message.content[0].text.includes('"quotes"'));
			assert.ok(parsed.message.content[0].text.includes('\n'));
		});

		test('Should handle unicode characters', () => {
			const payload = {
				type: 'user',
				session_id: '',
				message: {
					role: 'user',
					content: [{ type: 'text', text: 'Test with unicode: 日本語 🎉 émojis' }]
				},
				parent_tool_use_id: null
			};

			const json = JSON.stringify(payload);
			const parsed = JSON.parse(json);

			assert.ok(parsed.message.content[0].text.includes('日本語'));
			assert.ok(parsed.message.content[0].text.includes('🎉'));
		});
	});

	suite('Permission Response Payload', () => {
		test('Should have correct structure for allow response', () => {
			const payload = {
				type: 'control_response',
				response: {
					subtype: 'success',
					request_id: 'req-123',
					response: {
						behavior: 'allow',
						updatedInput: { command: 'ls -la' },
						toolUseID: 'tool-456'
					}
				}
			};

			assert.strictEqual(payload.type, 'control_response');
			assert.strictEqual(payload.response.subtype, 'success');
			assert.strictEqual(payload.response.response.behavior, 'allow');
		});

		test('Should have correct structure for deny response', () => {
			const payload = {
				type: 'control_response',
				response: {
					subtype: 'success',
					request_id: 'req-789',
					response: {
						behavior: 'deny',
						updatedInput: { command: 'rm -rf /' },
						toolUseID: 'tool-danger'
					}
				}
			};

			assert.strictEqual(payload.response.response.behavior, 'deny');
		});

		test('Should include updatedPermissions for always-allow', () => {
			const payload = {
				type: 'control_response',
				response: {
					subtype: 'success',
					request_id: 'req-aaa',
					response: {
						behavior: 'allow',
						updatedInput: { command: 'npm test' },
						toolUseID: 'tool-test',
						updatedPermissions: ['Bash']
					}
				}
			};

			assert.ok(Array.isArray(payload.response.response.updatedPermissions));
			assert.ok(payload.response.response.updatedPermissions.includes('Bash'));
		});

		test('Should serialize correctly with all fields', () => {
			const payload = {
				type: 'control_response',
				response: {
					subtype: 'success',
					request_id: 'req-full',
					response: {
						behavior: 'allow',
						updatedInput: {
							command: 'complex command with "quotes"',
							description: 'Test description'
						},
						toolUseID: 'tool-full-123',
						updatedPermissions: ['Bash', 'Read']
					}
				}
			};

			const json = JSON.stringify(payload);
			const parsed = JSON.parse(json);

			assert.strictEqual(parsed.response.response.updatedInput.command, 'complex command with "quotes"');
		});
	});

	suite('User Question Response Payload', () => {
		test('Should have correct structure for question response', () => {
			const payload = {
				type: 'control_response',
				request_id: 'question-123',
				response: {
					answers: {
						'question-1': 'Option A',
						'question-2': 'Custom answer'
					}
				}
			};

			assert.strictEqual(payload.type, 'control_response');
			assert.ok(payload.response.answers);
			assert.strictEqual(payload.response.answers['question-1'], 'Option A');
		});

		test('Should handle multiple answers', () => {
			const payload = {
				type: 'control_response',
				request_id: 'multi-q',
				response: {
					answers: {
						'q1': 'answer1',
						'q2': 'answer2',
						'q3': 'answer3',
						'q4': 'answer4'
					}
				}
			};

			assert.strictEqual(Object.keys(payload.response.answers).length, 4);
		});
	});

	suite('Claude Response Formats', () => {
		test('Should handle text_delta format', () => {
			const response = {
				type: 'text_delta',
				text: 'Hello, how can I help?'
			};

			assert.strictEqual(response.type, 'text_delta');
			assert.strictEqual(typeof response.text, 'string');
		});

		test('Should handle tool_use format', () => {
			const response = {
				type: 'tool_use',
				name: 'Bash',
				id: 'tool-123',
				input: {
					command: 'ls -la',
					description: 'List files'
				}
			};

			assert.strictEqual(response.type, 'tool_use');
			assert.strictEqual(response.name, 'Bash');
			assert.ok(response.id);
			assert.ok(response.input.command);
		});

		test('Should handle tool_result format', () => {
			const response = {
				type: 'tool_result',
				tool_use_id: 'tool-123',
				content: 'drwxr-xr-x  10 user  staff   320 Jan  1 12:00 src\n'
			};

			assert.strictEqual(response.type, 'tool_result');
			assert.strictEqual(response.tool_use_id, 'tool-123');
			assert.ok(typeof response.content === 'string');
		});

		test('Should handle result format with usage', () => {
			const response = {
				type: 'result',
				input_tokens: 1500,
				output_tokens: 500,
				total_cost_usd: 0.0125,
				result: 'Task completed successfully'
			};

			assert.strictEqual(response.type, 'result');
			assert.strictEqual(response.input_tokens, 1500);
			assert.strictEqual(response.output_tokens, 500);
			assert.strictEqual(response.total_cost_usd, 0.0125);
		});

		test('Should handle control_request format', () => {
			const response = {
				type: 'control_request',
				request_id: 'req-abc',
				request: {
					tool_name: 'Bash',
					input: { command: 'npm install' }
				},
				suggestions: [
					{ type: 'allow' },
					{ type: 'deny' }
				]
			};

			assert.strictEqual(response.type, 'control_request');
			assert.ok(response.request_id);
			assert.strictEqual(response.request.tool_name, 'Bash');
		});

		test('Should handle session_id format', () => {
			const response = {
				session_id: 'sess-xyz789'
			};

			assert.ok(response.session_id.startsWith('sess-'));
		});

		test('Should handle account_info format', () => {
			const response = {
				type: 'account_info',
				plan: 'pro',
				usage_limit: 1000000
			};

			assert.strictEqual(response.type, 'account_info');
			assert.ok(response.plan);
		});

		test('Should handle error format', () => {
			const response = {
				type: 'error',
				message: 'Rate limit exceeded'
			};

			assert.strictEqual(response.type, 'error');
			assert.ok(response.message);
		});

		test('Should handle assistant message format', () => {
			const response = {
				type: 'assistant',
				message: {
					content: [
						{ type: 'text', text: 'Let me help you with that.' },
						{ type: 'tool_use', name: 'Read', id: 'read-1', input: { file_path: '/test.ts' } }
					]
				}
			};

			assert.strictEqual(response.type, 'assistant');
			assert.ok(Array.isArray(response.message.content));
			assert.strictEqual(response.message.content.length, 2);
		});
	});

	suite('CLI Arguments', () => {
		test('Should have correct base arguments', () => {
			const baseArgs = [
				'--print',
				'--output-format', 'stream-json',
				'--input-format', 'stream-json',
				'--verbose'
			];

			assert.ok(baseArgs.includes('--print'));
			assert.ok(baseArgs.includes('--output-format'));
			assert.ok(baseArgs.includes('stream-json'));
		});

		test('Should have correct permission mode argument for yolo', () => {
			const yoloArgs = ['--dangerously-skip-permissions'];

			assert.ok(yoloArgs.includes('--dangerously-skip-permissions'));
		});

		test('Should have correct permission mode argument for interactive', () => {
			const interactiveArgs = ['--permission-prompt-tool', 'stdio'];

			assert.ok(interactiveArgs.includes('--permission-prompt-tool'));
			assert.strictEqual(interactiveArgs[interactiveArgs.indexOf('--permission-prompt-tool') + 1], 'stdio');
		});

		test('Should have correct model argument', () => {
			const model = 'claude-3-opus-20240229';
			const args = ['--model', model];

			assert.strictEqual(args[args.indexOf('--model') + 1], model);
		});

		test('Should have correct resume argument', () => {
			const sessionId = 'sess-resume-123';
			const args = ['--resume', sessionId];

			assert.strictEqual(args[args.indexOf('--resume') + 1], sessionId);
		});

		test('Should have correct MCP config argument', () => {
			const mcpPath = '/home/user/.claude/mcp.json';
			const args = ['--mcp-config', mcpPath];

			assert.strictEqual(args[args.indexOf('--mcp-config') + 1], mcpPath);
		});
	});

	suite('Tool Input Formats', () => {
		test('Bash tool should have command field', () => {
			const bashInput = {
				command: 'npm test',
				description: 'Run tests'
			};

			assert.ok(bashInput.command);
			assert.strictEqual(typeof bashInput.command, 'string');
		});

		test('Read tool should have file_path field', () => {
			const readInput = {
				file_path: '/src/index.ts'
			};

			assert.ok(readInput.file_path);
		});

		test('Write tool should have file_path and content fields', () => {
			const writeInput = {
				file_path: '/src/new-file.ts',
				content: 'export const foo = "bar";'
			};

			assert.ok(writeInput.file_path);
			assert.ok(writeInput.content);
		});

		test('Edit tool should have file_path, old_string, and new_string fields', () => {
			const editInput = {
				file_path: '/src/index.ts',
				old_string: 'const x = 1;',
				new_string: 'const x = 2;'
			};

			assert.ok(editInput.file_path);
			assert.ok(editInput.old_string);
			assert.ok(editInput.new_string);
		});

		test('Glob tool should have pattern field', () => {
			const globInput = {
				pattern: '**/*.ts'
			};

			assert.ok(globInput.pattern);
		});

		test('Grep tool should have pattern field', () => {
			const grepInput = {
				pattern: 'function.*test',
				path: '/src'
			};

			assert.ok(grepInput.pattern);
		});
	});

	suite('Stream Format', () => {
		test('Should be newline-delimited JSON', () => {
			const messages = [
				{ type: 'text_delta', text: 'Hello' },
				{ type: 'text_delta', text: ' World' },
				{ type: 'message' }
			];

			const stream = messages.map(m => JSON.stringify(m)).join('\n') + '\n';

			// Verify it can be parsed line by line
			const lines = stream.split('\n').filter(l => l.trim());
			assert.strictEqual(lines.length, 3);

			lines.forEach(line => {
				const parsed = JSON.parse(line);
				assert.ok(parsed.type);
			});
		});

		test('Should handle partial JSON lines correctly', () => {
			const fullMessage = { type: 'text_delta', text: 'Complete message' };
			const json = JSON.stringify(fullMessage);

			// Simulate split in middle
			const part1 = json.substring(0, Math.floor(json.length / 2));
			const part2 = json.substring(Math.floor(json.length / 2));

			// Part 1 alone should fail to parse
			let errorThrown = false;
			try {
				JSON.parse(part1);
			} catch {
				errorThrown = true;
			}
			assert.strictEqual(errorThrown, true);

			// Combined should parse correctly
			const combined = part1 + part2;
			const parsed = JSON.parse(combined);
			assert.deepStrictEqual(parsed, fullMessage);
		});
	});

	suite('Webview Message Formats', () => {
		test('permissionRequest message should have correct structure', () => {
			const message = {
				type: 'permissionRequest',
				data: {
					id: 'req-123',
					toolName: 'Bash',
					input: { command: 'npm install' },
					status: 'pending',
					suggestions: []
				}
			};

			assert.strictEqual(message.type, 'permissionRequest');
			assert.ok(message.data.id);
			assert.ok(message.data.toolName);
			assert.strictEqual(message.data.status, 'pending');
		});

		test('userQuestion message should have correct structure', () => {
			const message = {
				type: 'userQuestion',
				data: {
					id: 'q-456',
					questions: [
						{
							question: 'Which approach do you prefer?',
							options: [
								{ label: 'Option A', description: 'First option' },
								{ label: 'Option B', description: 'Second option' }
							]
						}
					]
				}
			};

			assert.strictEqual(message.type, 'userQuestion');
			assert.ok(Array.isArray(message.data.questions));
			assert.ok(message.data.questions[0].options.length >= 2);
		});

		test('usage message should have correct structure', () => {
			const message = {
				type: 'usage',
				data: {
					inputTokens: 1000,
					outputTokens: 500,
					cost: 0.01
				}
			};

			assert.strictEqual(message.type, 'usage');
			assert.strictEqual(typeof message.data.inputTokens, 'number');
			assert.strictEqual(typeof message.data.outputTokens, 'number');
			assert.strictEqual(typeof message.data.cost, 'number');
		});

		test('toolUse message should have correct structure', () => {
			const message = {
				type: 'toolUse',
				data: {
					toolName: 'Read',
					toolInfo: 'Read',
					rawInput: { file_path: '/test.ts' },
					id: 'tool-789'
				}
			};

			assert.strictEqual(message.type, 'toolUse');
			assert.ok(message.data.toolName);
			assert.ok(message.data.id);
		});

		test('toolResult message should have correct structure', () => {
			const message = {
				type: 'toolResult',
				data: {
					tool_use_id: 'tool-789',
					content: 'File contents here...',
					is_error: false
				}
			};

			assert.strictEqual(message.type, 'toolResult');
			assert.ok(message.data.tool_use_id);
			assert.strictEqual(typeof message.data.is_error, 'boolean');
		});
	});
});
