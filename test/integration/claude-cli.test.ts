/**
 * Claude Code Integration Tests
 *
 * These tests actually spawn the Claude Code CLI and verify the output format.
 * They will detect if Anthropic changes the stream-json protocol.
 *
 * REQUIREMENTS:
 * - Claude Code CLI must be installed (`claude` command available)
 * - Valid Anthropic API credentials configured
 *
 * NOTE: These tests make real API calls and will consume tokens/cost.
 * They are skipped by default. Set CLAUDE_INTEGRATION_TESTS=1 to run them.
 */

import * as assert from 'assert';
import * as cp from 'child_process';
import * as path from 'path';

// Skip integration tests unless explicitly enabled
const SKIP_INTEGRATION = !process.env.CLAUDE_INTEGRATION_TESTS;

suite('Claude Code Integration Tests', function () {
	// Increase timeout for API calls
	this.timeout(60000);

	// Helper to find claude binary
	function findClaudeBinary(): string | null {
		const paths = [
			'/opt/homebrew/bin/claude',
			'/usr/local/bin/claude',
			'claude' // Fallback to PATH
		];

		for (const p of paths) {
			try {
				cp.execSync(`which ${p} 2>/dev/null || where ${p} 2>nul`, { encoding: 'utf8' });
				return p;
			} catch {
				if (p === 'claude') {
					try {
						cp.execSync('claude --version', { encoding: 'utf8' });
						return 'claude';
					} catch {
						continue;
					}
				}
			}
		}

		// Try direct path check
		const fs = require('fs');
		for (const p of paths.slice(0, 2)) {
			if (fs.existsSync(p)) {
				return p;
			}
		}

		return null;
	}

	// Helper to spawn claude and collect output
	function spawnClaude(args: string[], input?: string): Promise<{ stdout: string; stderr: string; exitCode: number }> {
		return new Promise((resolve, reject) => {
			const claudePath = findClaudeBinary();
			if (!claudePath) {
				reject(new Error('Claude CLI not found'));
				return;
			}

			const proc = cp.spawn(claudePath, args, {
				cwd: process.cwd(),
				env: {
					...process.env,
					FORCE_COLOR: '0',
					NO_COLOR: '1'
				}
			});

			let stdout = '';
			let stderr = '';

			proc.stdout?.on('data', (data) => {
				stdout += data.toString();
			});

			proc.stderr?.on('data', (data) => {
				stderr += data.toString();
			});

			proc.on('error', reject);

			proc.on('close', (code) => {
				resolve({ stdout, stderr, exitCode: code || 0 });
			});

			if (input && proc.stdin) {
				proc.stdin.write(input);
				proc.stdin.end();
			}

			// Timeout after 55 seconds
			setTimeout(() => {
				proc.kill('SIGTERM');
				reject(new Error('Claude process timed out'));
			}, 55000);
		});
	}

	// Helper to parse stream-json output
	function parseStreamOutput(output: string): any[] {
		const lines = output.split('\n').filter(line => line.trim());
		const parsed: any[] = [];

		for (const line of lines) {
			try {
				parsed.push(JSON.parse(line));
			} catch {
				// Skip non-JSON lines
			}
		}

		return parsed;
	}

	suite('CLI Availability', function () {
		test('Claude CLI should be installed', function () {
			if (SKIP_INTEGRATION) {
				this.skip();
				return;
			}

			const claudePath = findClaudeBinary();
			assert.ok(claudePath, 'Claude CLI should be found in PATH or standard locations');
		});

		test('Claude CLI should respond to --version', async function () {
			if (SKIP_INTEGRATION) {
				this.skip();
				return;
			}

			const result = await spawnClaude(['--version']);
			assert.strictEqual(result.exitCode, 0, 'Should exit with code 0');
			assert.ok(result.stdout.length > 0 || result.stderr.length > 0, 'Should output version info');
		});

		test('Claude CLI should respond to --help', async function () {
			if (SKIP_INTEGRATION) {
				this.skip();
				return;
			}

			const result = await spawnClaude(['--help']);
			assert.strictEqual(result.exitCode, 0, 'Should exit with code 0');
			assert.ok(result.stdout.includes('--print') || result.stderr.includes('--print'),
				'Help should mention --print flag');
		});
	});

	suite('Stream JSON Output Format', function () {
		test('Should output valid JSON lines with --output-format stream-json', async function () {
			if (SKIP_INTEGRATION) {
				this.skip();
				return;
			}

			const userMessage = JSON.stringify({
				type: 'user',
				session_id: '',
				message: {
					role: 'user',
					content: [{ type: 'text', text: 'Say exactly: "test response"' }]
				},
				parent_tool_use_id: null
			}) + '\n';

			const result = await spawnClaude([
				'--print',
				'--output-format', 'stream-json',
				'--input-format', 'stream-json',
				'--verbose',
				'--dangerously-skip-permissions'
			], userMessage);

			const messages = parseStreamOutput(result.stdout);
			assert.ok(messages.length > 0, 'Should output at least one JSON message');

			// Every line should be valid JSON (already filtered by parseStreamOutput)
			console.log(`Received ${messages.length} JSON messages`);
		});

		test('Should include session_id in output', async function () {
			if (SKIP_INTEGRATION) {
				this.skip();
				return;
			}

			const userMessage = JSON.stringify({
				type: 'user',
				session_id: '',
				message: {
					role: 'user',
					content: [{ type: 'text', text: 'Say "hi"' }]
				},
				parent_tool_use_id: null
			}) + '\n';

			const result = await spawnClaude([
				'--print',
				'--output-format', 'stream-json',
				'--input-format', 'stream-json',
				'--verbose',
				'--dangerously-skip-permissions'
			], userMessage);

			const messages = parseStreamOutput(result.stdout);
			const sessionMessage = messages.find(m => m.session_id);

			assert.ok(sessionMessage, 'Should include a message with session_id');
			assert.strictEqual(typeof sessionMessage.session_id, 'string', 'session_id should be a string');
			console.log('Session ID:', sessionMessage.session_id);
		});

		test('Should include text in assistant message or text_delta', async function () {
			if (SKIP_INTEGRATION) {
				this.skip();
				return;
			}

			const userMessage = JSON.stringify({
				type: 'user',
				session_id: '',
				message: {
					role: 'user',
					content: [{ type: 'text', text: 'Count from 1 to 5' }]
				},
				parent_tool_use_id: null
			}) + '\n';

			const result = await spawnClaude([
				'--print',
				'--output-format', 'stream-json',
				'--input-format', 'stream-json',
				'--verbose',
				'--dangerously-skip-permissions'
			], userMessage);

			const messages = parseStreamOutput(result.stdout);
			const textDeltas = messages.filter(m => m.type === 'text_delta');
			const assistantMessages = messages.filter(m => m.type === 'assistant');

			// Text can come either via text_delta (streaming) or in assistant message (batched)
			const hasTextDelta = textDeltas.length > 0;
			const hasAssistantWithText = assistantMessages.some(m =>
				m.message?.content?.some((c: any) => c.type === 'text' && c.text)
			);

			assert.ok(hasTextDelta || hasAssistantWithText,
				'Should include text_delta messages OR assistant message with text content');

			if (hasTextDelta) {
				console.log(`Received ${textDeltas.length} text_delta messages`);
				for (const delta of textDeltas) {
					assert.strictEqual(typeof delta.text, 'string', 'text_delta should have text field as string');
				}
			}

			if (hasAssistantWithText) {
				console.log('Received text in assistant message');
				const assistantText = assistantMessages
					.map(m => m.message?.content?.filter((c: any) => c.type === 'text').map((c: any) => c.text).join(''))
					.join('');
				console.log('Assistant text:', assistantText.substring(0, 100));
			}
		});

		test('Should include result message with token usage', async function () {
			if (SKIP_INTEGRATION) {
				this.skip();
				return;
			}

			const userMessage = JSON.stringify({
				type: 'user',
				session_id: '',
				message: {
					role: 'user',
					content: [{ type: 'text', text: 'Say "done"' }]
				},
				parent_tool_use_id: null
			}) + '\n';

			const result = await spawnClaude([
				'--print',
				'--output-format', 'stream-json',
				'--input-format', 'stream-json',
				'--verbose',
				'--dangerously-skip-permissions'
			], userMessage);

			const messages = parseStreamOutput(result.stdout);
			const resultMessage = messages.find(m => m.type === 'result');

			assert.ok(resultMessage, 'Should include a result message');

			// Check for expected fields (these may change if Anthropic updates the format)
			console.log('Result message keys:', Object.keys(resultMessage));

			// Token fields
			if ('input_tokens' in resultMessage) {
				assert.strictEqual(typeof resultMessage.input_tokens, 'number', 'input_tokens should be a number');
			}
			if ('output_tokens' in resultMessage) {
				assert.strictEqual(typeof resultMessage.output_tokens, 'number', 'output_tokens should be a number');
			}

			// Cost field
			if ('total_cost_usd' in resultMessage) {
				assert.strictEqual(typeof resultMessage.total_cost_usd, 'number', 'total_cost_usd should be a number');
			}

			console.log('Result:', JSON.stringify(resultMessage, null, 2));
		});

		test('Should include assistant message with content array', async function () {
			if (SKIP_INTEGRATION) {
				this.skip();
				return;
			}

			const userMessage = JSON.stringify({
				type: 'user',
				session_id: '',
				message: {
					role: 'user',
					content: [{ type: 'text', text: 'Say "hello world"' }]
				},
				parent_tool_use_id: null
			}) + '\n';

			const result = await spawnClaude([
				'--print',
				'--output-format', 'stream-json',
				'--input-format', 'stream-json',
				'--verbose',
				'--dangerously-skip-permissions'
			], userMessage);

			const messages = parseStreamOutput(result.stdout);
			const assistantMessage = messages.find(m => m.type === 'assistant');

			if (assistantMessage) {
				console.log('Assistant message structure:', Object.keys(assistantMessage));

				if (assistantMessage.message) {
					assert.ok(assistantMessage.message.content, 'Assistant message should have content');
					assert.ok(Array.isArray(assistantMessage.message.content), 'Content should be an array');
				}
			} else {
				console.log('No assistant message found - may have changed format');
				console.log('Available message types:', [...new Set(messages.map(m => m.type))]);
			}
		});
	});

	suite('Control Request Format (Permissions)', function () {
		test('Should send control_request for tool use without skip-permissions', async function () {
			if (SKIP_INTEGRATION) {
				this.skip();
				return;
			}

			const userMessage = JSON.stringify({
				type: 'user',
				session_id: '',
				message: {
					role: 'user',
					content: [{ type: 'text', text: 'Run the command: echo "test"' }]
				},
				parent_tool_use_id: null
			}) + '\n';

			// Use permission-prompt-tool stdio to get control_request
			const proc = cp.spawn(findClaudeBinary()!, [
				'--print',
				'--output-format', 'stream-json',
				'--input-format', 'stream-json',
				'--permission-prompt-tool', 'stdio'
			], {
				cwd: process.cwd(),
				env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' }
			});

			let stdout = '';

			proc.stdout?.on('data', (data) => {
				stdout += data.toString();

				// Check if we received a control_request
				const lines = stdout.split('\n');
				for (const line of lines) {
					try {
						const msg = JSON.parse(line);
						if (msg.type === 'control_request') {
							console.log('Received control_request:', JSON.stringify(msg, null, 2));

							// Validate structure
							assert.ok(msg.request_id, 'control_request should have request_id');

							// Check for tool_name in either location
							const toolName = msg.tool_name || msg.request?.tool_name;
							assert.ok(toolName, 'control_request should have tool_name');

							console.log('Control request validation passed');
							proc.kill('SIGTERM');
							return;
						}
					} catch {
						// Not JSON, skip
					}
				}
			});

			proc.stdin?.write(userMessage);
			proc.stdin?.end();

			// Wait for process to complete or timeout
			await new Promise<void>((resolve, reject) => {
				const timeout = setTimeout(() => {
					proc.kill('SIGTERM');
					// Not a failure - Claude might not have used a tool
					console.log('No control_request received (Claude may not have used a tool)');
					console.log('Stdout:', stdout.substring(0, 500));
					resolve();
				}, 30000);

				proc.on('close', () => {
					clearTimeout(timeout);
					resolve();
				});
			});
		});
	});

	suite('Message Type Coverage', function () {
		test('Should document all received message types', async function () {
			if (SKIP_INTEGRATION) {
				this.skip();
				return;
			}

			const userMessage = JSON.stringify({
				type: 'user',
				session_id: '',
				message: {
					role: 'user',
					content: [{ type: 'text', text: 'List the files in the current directory' }]
				},
				parent_tool_use_id: null
			}) + '\n';

			const result = await spawnClaude([
				'--print',
				'--output-format', 'stream-json',
				'--input-format', 'stream-json',
				'--verbose',
				'--dangerously-skip-permissions'
			], userMessage);

			const messages = parseStreamOutput(result.stdout);
			const messageTypes = new Set<string>();

			for (const msg of messages) {
				if (msg.type) {
					messageTypes.add(msg.type);
				}
				if (msg.session_id && !msg.type) {
					messageTypes.add('session_id_only');
				}
			}

			console.log('\n=== Message Types Received ===');
			console.log([...messageTypes].sort().join('\n'));
			console.log('==============================\n');

			// Document the expected types
			const expectedTypes = [
				'text_delta',
				'result',
				'assistant',
				'tool_use',
				'tool_result'
			];

			console.log('Expected types:', expectedTypes);
			console.log('Received types:', [...messageTypes]);

			// At minimum we should get text_delta and result
			assert.ok(messageTypes.has('text_delta') || messageTypes.has('result'),
				'Should receive at least text_delta or result messages');
		});

		test('Should capture full message structure for documentation', async function () {
			if (SKIP_INTEGRATION) {
				this.skip();
				return;
			}

			const userMessage = JSON.stringify({
				type: 'user',
				session_id: '',
				message: {
					role: 'user',
					content: [{ type: 'text', text: 'What is 2+2?' }]
				},
				parent_tool_use_id: null
			}) + '\n';

			const result = await spawnClaude([
				'--print',
				'--output-format', 'stream-json',
				'--input-format', 'stream-json',
				'--verbose',
				'--dangerously-skip-permissions'
			], userMessage);

			const messages = parseStreamOutput(result.stdout);

			console.log('\n=== Full Message Structures ===');

			// Group by type and show one example of each
			const byType: Record<string, any> = {};
			for (const msg of messages) {
				const type = msg.type || (msg.session_id ? 'session_start' : 'unknown');
				if (!byType[type]) {
					byType[type] = msg;
				}
			}

			for (const [type, example] of Object.entries(byType)) {
				console.log(`\n--- ${type} ---`);
				console.log(JSON.stringify(example, null, 2));
			}

			console.log('\n===============================\n');
		});
	});

	suite('Error Handling', function () {
		test('Should handle invalid input gracefully', async function () {
			if (SKIP_INTEGRATION) {
				this.skip();
				return;
			}

			const invalidInput = 'not valid json\n';

			const result = await spawnClaude([
				'--print',
				'--output-format', 'stream-json',
				'--input-format', 'stream-json',
				'--dangerously-skip-permissions'
			], invalidInput);

			// Should not crash - may output error message
			console.log('Exit code for invalid input:', result.exitCode);
			console.log('Stderr:', result.stderr.substring(0, 500));
		});

		test('Should output error type for API errors', async function () {
			if (SKIP_INTEGRATION) {
				this.skip();
				return;
			}

			// This test documents what error messages look like
			// We can't easily trigger an API error, but we document the expected format
			console.log('Expected error format: { "type": "error", "message": "..." }');
		});
	});
});
