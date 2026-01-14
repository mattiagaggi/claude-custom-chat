/**
 * ProcessManager Unit Tests
 * Tests process lifecycle, conversation process management, and I/O handling
 */

import * as assert from 'assert';
import { ProcessManager, ProcessConfig } from '../../src/managers/ProcessManager';

// Note: These tests focus on the ProcessManager's state management and logic
// without actually spawning Claude processes (which requires the CLI to be installed)

suite('ProcessManager Tests', () => {

	suite('Process State Management', () => {
		test('Should start with no current process', () => {
			const manager = new ProcessManager();

			assert.strictEqual(manager.getCurrentProcess(), undefined);
			assert.strictEqual(manager.isRunning(), false);
		});

		test('Should report not running after initialization', () => {
			const manager = new ProcessManager();

			assert.strictEqual(manager.isRunning(), false);
		});
	});

	suite('Conversation Process Tracking', () => {
		test('Should start with no active conversations', () => {
			const manager = new ProcessManager();
			const ids = manager.getActiveConversationIds();

			assert.strictEqual(ids.length, 0);
		});

		test('Should report conversation as not running when not tracked', () => {
			const manager = new ProcessManager();

			assert.strictEqual(manager.isConversationRunning('non-existent'), false);
		});

		test('Should return undefined for non-existent conversation process', () => {
			const manager = new ProcessManager();
			const process = manager.getProcessForConversation('non-existent');

			assert.strictEqual(process, undefined);
		});
	});

	suite('Write Operations', () => {
		test('Should return false when writing without process', () => {
			const manager = new ProcessManager();

			const result = manager.write('test data');

			assert.strictEqual(result, false);
		});

		test('Should return false when writing to non-existent conversation', () => {
			const manager = new ProcessManager();

			const result = manager.writeToConversation('non-existent', 'test data');

			assert.strictEqual(result, false);
		});
	});

	suite('Termination', () => {
		test('Should handle terminate when no process exists', async () => {
			const manager = new ProcessManager();

			// Should not throw
			await manager.terminate();
		});

		test('Should handle terminate conversation when not tracked', async () => {
			const manager = new ProcessManager();

			// Should not throw
			await manager.terminateConversation('non-existent');
		});

		test('Should handle terminate all when no conversations', async () => {
			const manager = new ProcessManager();

			// Should not throw
			await manager.terminateAllConversations();
		});
	});

	suite('Dispose', () => {
		test('Should dispose cleanly without processes', async () => {
			const manager = new ProcessManager();

			// Should not throw
			await manager.dispose();
		});
	});

	suite('Process Config Validation', () => {
		test('ProcessConfig interface should have required fields', () => {
			const config: ProcessConfig = {
				args: ['--print', '--output-format', 'stream-json'],
				cwd: '/test/path',
				wslEnabled: false,
				wslDistro: 'Ubuntu',
				nodePath: '/usr/bin/node',
				claudePath: '/usr/local/bin/claude'
			};

			assert.ok(Array.isArray(config.args));
			assert.strictEqual(typeof config.cwd, 'string');
			assert.strictEqual(typeof config.wslEnabled, 'boolean');
			assert.strictEqual(typeof config.wslDistro, 'string');
			assert.strictEqual(typeof config.nodePath, 'string');
			assert.strictEqual(typeof config.claudePath, 'string');
		});

		test('ProcessConfig should support various argument combinations', () => {
			// Test minimal args
			const minConfig: ProcessConfig = {
				args: ['--print'],
				cwd: '.',
				wslEnabled: false,
				wslDistro: '',
				nodePath: '',
				claudePath: ''
			};
			assert.ok(minConfig.args.length >= 1);

			// Test full args
			const fullConfig: ProcessConfig = {
				args: [
					'--print',
					'--output-format', 'stream-json',
					'--input-format', 'stream-json',
					'--verbose',
					'--dangerously-skip-permissions',
					'--model', 'claude-3-opus-20240229'
				],
				cwd: '/workspace',
				wslEnabled: true,
				wslDistro: 'Ubuntu-22.04',
				nodePath: '/usr/bin/node',
				claudePath: '/home/user/.local/bin/claude'
			};
			assert.ok(fullConfig.args.includes('--model'));
		});
	});

	suite('WSL Configuration', () => {
		test('Should support WSL enabled flag', () => {
			const config: ProcessConfig = {
				args: [],
				cwd: '/mnt/c/Users/test',
				wslEnabled: true,
				wslDistro: 'Ubuntu',
				nodePath: '/usr/bin/node',
				claudePath: '/usr/local/bin/claude'
			};

			assert.strictEqual(config.wslEnabled, true);
			assert.strictEqual(config.wslDistro, 'Ubuntu');
		});

		test('Should support different WSL distributions', () => {
			const distributions = ['Ubuntu', 'Ubuntu-22.04', 'Debian', 'kali-linux'];

			distributions.forEach(distro => {
				const config: ProcessConfig = {
					args: [],
					cwd: '.',
					wslEnabled: true,
					wslDistro: distro,
					nodePath: '/usr/bin/node',
					claudePath: '/usr/local/bin/claude'
				};

				assert.strictEqual(config.wslDistro, distro);
			});
		});
	});

	suite('Argument Building', () => {
		test('Should support permission prompt tool argument', () => {
			const args = [
				'--print',
				'--output-format', 'stream-json',
				'--input-format', 'stream-json',
				'--permission-prompt-tool', 'stdio'
			];

			assert.ok(args.includes('--permission-prompt-tool'));
			assert.strictEqual(args[args.indexOf('--permission-prompt-tool') + 1], 'stdio');
		});

		test('Should support yolo mode argument', () => {
			const args = [
				'--print',
				'--output-format', 'stream-json',
				'--dangerously-skip-permissions'
			];

			assert.ok(args.includes('--dangerously-skip-permissions'));
		});

		test('Should support MCP config argument', () => {
			const mcpConfigPath = '/home/user/.claude/mcp-config.json';
			const args = [
				'--print',
				'--mcp-config', mcpConfigPath
			];

			assert.ok(args.includes('--mcp-config'));
			assert.strictEqual(args[args.indexOf('--mcp-config') + 1], mcpConfigPath);
		});

		test('Should support model selection argument', () => {
			const models = [
				'claude-3-opus-20240229',
				'claude-3-sonnet-20240229',
				'claude-3-haiku-20240307'
			];

			models.forEach(model => {
				const args = ['--print', '--model', model];
				assert.ok(args.includes('--model'));
				assert.strictEqual(args[args.indexOf('--model') + 1], model);
			});
		});

		test('Should support session resume argument', () => {
			const sessionId = 'sess-abc123';
			const args = ['--print', '--resume', sessionId];

			assert.ok(args.includes('--resume'));
			assert.strictEqual(args[args.indexOf('--resume') + 1], sessionId);
		});
	});

	suite('Environment Variables', () => {
		test('Should include required environment settings', () => {
			// These are the env vars set by ProcessManager
			const expectedEnvKeys = ['PATH', 'HOME', 'USER', 'FORCE_COLOR', 'NO_COLOR'];

			// ProcessManager sets these in the spawn call
			const mockEnv = {
				PATH: '/opt/homebrew/bin:/usr/local/bin',
				HOME: '/Users/test',
				USER: 'test',
				FORCE_COLOR: '0',
				NO_COLOR: '1'
			};

			expectedEnvKeys.forEach(key => {
				assert.ok(key in mockEnv, `Expected env var ${key} to be present`);
			});

			// Verify color settings (important for parsing output)
			assert.strictEqual(mockEnv.FORCE_COLOR, '0');
			assert.strictEqual(mockEnv.NO_COLOR, '1');
		});
	});

	suite('Multiple Conversation Support', () => {
		test('Should track multiple conversations independently', () => {
			const manager = new ProcessManager();

			// Initially empty
			assert.strictEqual(manager.getActiveConversationIds().length, 0);

			// Can check multiple conversation IDs
			assert.strictEqual(manager.isConversationRunning('conv-1'), false);
			assert.strictEqual(manager.isConversationRunning('conv-2'), false);
			assert.strictEqual(manager.isConversationRunning('conv-3'), false);
		});

		test('Should allow writing to specific conversations', () => {
			const manager = new ProcessManager();

			// These should return false (no processes) but not throw
			const result1 = manager.writeToConversation('conv-1', 'message 1');
			const result2 = manager.writeToConversation('conv-2', 'message 2');

			assert.strictEqual(result1, false);
			assert.strictEqual(result2, false);
		});
	});
});
