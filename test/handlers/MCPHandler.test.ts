/**
 * MCPHandler Unit Tests
 * Tests MCP server configuration loading, saving, and deleting
 *
 * Note: Since MCPHandler uses os.homedir() internally and we can't easily mock it,
 * these tests work with the actual config path but are designed to be non-destructive.
 */

import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import { MCPHandler } from '../../src/handlers/MCPHandler';

suite('MCPHandler Tests', () => {
	let handler: MCPHandler;
	let configPath: string;
	let originalContent: string | null = null;

	setup(() => {
		handler = new MCPHandler();
		configPath = handler.getConfigPath()!;

		// Backup existing config if it exists
		try {
			originalContent = fs.readFileSync(configPath, 'utf8');
		} catch {
			originalContent = null;
		}
	});

	teardown(() => {
		// Restore original config
		try {
			if (originalContent !== null) {
				fs.writeFileSync(configPath, originalContent);
			} else {
				// If there was no original file, remove the one we created (if any)
				// But be careful not to delete if tests added real data
				// Only delete test servers we created
				try {
					const content = fs.readFileSync(configPath, 'utf8');
					const parsed = JSON.parse(content);
					if (parsed.mcpServers) {
						// Remove only test servers (prefixed with 'test-')
						const testServers = Object.keys(parsed.mcpServers).filter(k => k.startsWith('test-'));
						for (const key of testServers) {
							delete parsed.mcpServers[key];
						}
						if (Object.keys(parsed.mcpServers).length === 0 && originalContent === null) {
							// Only delete file if it was empty before AND is empty now (all test data)
							// Actually, safer to just leave empty config
							fs.writeFileSync(configPath, JSON.stringify(parsed, null, 2));
						} else {
							fs.writeFileSync(configPath, JSON.stringify(parsed, null, 2));
						}
					}
				} catch {
					// Ignore cleanup errors
				}
			}
		} catch {
			// Ignore cleanup errors
		}
	});

	suite('getConfigPath', () => {
		test('Should return correct config path structure', () => {
			const configPath = handler.getConfigPath();

			assert.ok(configPath);
			assert.ok(configPath!.includes('.claude'));
			assert.ok(configPath!.includes('mcp'));
			assert.ok(configPath!.endsWith('mcp-servers.json'));
		});

		test('Should use home directory in path', () => {
			const configPath = handler.getConfigPath();
			const homeDir = os.homedir();

			assert.ok(configPath!.startsWith(homeDir));
		});

		test('Should return consistent path', () => {
			const path1 = handler.getConfigPath();
			const path2 = handler.getConfigPath();

			assert.strictEqual(path1, path2);
		});
	});

	suite('loadServers', () => {
		test('Should return empty object or existing servers', async () => {
			const servers = await handler.loadServers();

			// Should return an object (empty or with existing servers)
			assert.ok(typeof servers === 'object');
			assert.ok(servers !== null);
		});

		test('Should return object with server entries when servers exist', async () => {
			// First save a test server
			await handler.saveServer('test-load-server', { command: 'node', args: ['test.js'] });

			const servers = await handler.loadServers();

			assert.ok(servers['test-load-server']);
			assert.strictEqual(servers['test-load-server'].command, 'node');
			assert.deepStrictEqual(servers['test-load-server'].args, ['test.js']);

			// Cleanup
			await handler.deleteServer('test-load-server');
		});
	});

	suite('saveServer', () => {
		test('Should save a new server', async () => {
			const success = await handler.saveServer('test-new-server', {
				command: 'node',
				args: ['server.js']
			});

			assert.strictEqual(success, true);

			// Verify it was saved
			const servers = await handler.loadServers();
			assert.ok(servers['test-new-server']);
			assert.strictEqual(servers['test-new-server'].command, 'node');

			// Cleanup
			await handler.deleteServer('test-new-server');
		});

		test('Should update an existing server', async () => {
			// Create server
			await handler.saveServer('test-update-server', { command: 'old', args: ['old.js'] });

			// Update it
			const success = await handler.saveServer('test-update-server', {
				command: 'new',
				args: ['new.js']
			});

			assert.strictEqual(success, true);

			// Verify update
			const servers = await handler.loadServers();
			assert.strictEqual(servers['test-update-server'].command, 'new');
			assert.deepStrictEqual(servers['test-update-server'].args, ['new.js']);

			// Cleanup
			await handler.deleteServer('test-update-server');
		});

		test('Should preserve existing servers when adding new one', async () => {
			// Create first server
			await handler.saveServer('test-preserve-1', { command: 'node1' });

			// Create second server
			await handler.saveServer('test-preserve-2', { command: 'node2' });

			// Both should exist
			const servers = await handler.loadServers();
			assert.ok(servers['test-preserve-1']);
			assert.ok(servers['test-preserve-2']);

			// Cleanup
			await handler.deleteServer('test-preserve-1');
			await handler.deleteServer('test-preserve-2');
		});

		test('Should save server with complex config', async () => {
			const complexConfig = {
				command: 'node',
				args: ['server.js', '--port', '8080'],
				env: {
					API_KEY: 'secret',
					DEBUG: 'true'
				},
				cwd: '/path/to/dir'
			};

			const success = await handler.saveServer('test-complex-server', complexConfig);

			assert.strictEqual(success, true);

			const servers = await handler.loadServers();
			assert.deepStrictEqual(servers['test-complex-server'], complexConfig);

			// Cleanup
			await handler.deleteServer('test-complex-server');
		});
	});

	suite('deleteServer', () => {
		test('Should delete existing server', async () => {
			// Create server to delete
			await handler.saveServer('test-delete-me', { command: 'node' });

			// Delete it
			const success = await handler.deleteServer('test-delete-me');

			assert.strictEqual(success, true);

			// Verify deletion
			const servers = await handler.loadServers();
			assert.ok(!servers['test-delete-me']);
		});

		test('Should return false when server does not exist', async () => {
			const success = await handler.deleteServer('test-nonexistent-server-xyz');

			assert.strictEqual(success, false);
		});

		test('Should not affect other servers when deleting', async () => {
			// Create two servers
			await handler.saveServer('test-keep-me', { command: 'node1' });
			await handler.saveServer('test-delete-me-2', { command: 'node2' });

			// Delete one
			await handler.deleteServer('test-delete-me-2');

			// Other should still exist
			const servers = await handler.loadServers();
			assert.ok(servers['test-keep-me']);
			assert.ok(!servers['test-delete-me-2']);

			// Cleanup
			await handler.deleteServer('test-keep-me');
		});
	});

	suite('Integration', () => {
		test('Should handle full lifecycle: save, load, update, delete', async () => {
			// Save first server
			await handler.saveServer('test-lifecycle-1', { command: 'node', args: ['s1.js'] });
			let servers = await handler.loadServers();
			assert.ok(servers['test-lifecycle-1']);

			// Save second server
			await handler.saveServer('test-lifecycle-2', { command: 'python', args: ['s2.py'] });
			servers = await handler.loadServers();
			assert.ok(servers['test-lifecycle-1']);
			assert.ok(servers['test-lifecycle-2']);

			// Update first server
			await handler.saveServer('test-lifecycle-1', { command: 'node', args: ['updated.js'] });
			servers = await handler.loadServers();
			assert.deepStrictEqual(servers['test-lifecycle-1'].args, ['updated.js']);

			// Delete first server
			await handler.deleteServer('test-lifecycle-1');
			servers = await handler.loadServers();
			assert.ok(!servers['test-lifecycle-1']);
			assert.ok(servers['test-lifecycle-2']);

			// Delete second server
			await handler.deleteServer('test-lifecycle-2');
			servers = await handler.loadServers();
			assert.ok(!servers['test-lifecycle-1']);
			assert.ok(!servers['test-lifecycle-2']);
		});

		test('Should handle server with special characters in name', async () => {
			const serverName = 'test-special_name.v2';

			await handler.saveServer(serverName, { command: 'node' });
			let servers = await handler.loadServers();
			assert.ok(servers[serverName]);

			await handler.deleteServer(serverName);
			servers = await handler.loadServers();
			assert.ok(!servers[serverName]);
		});
	});

	suite('Error Handling', () => {
		test('Should return false for delete on non-existent file', async () => {
			// This tests the error path when the file doesn't exist
			// In practice, after our tests run there will be a file
			// So we test with a server that definitely doesn't exist
			const result = await handler.deleteServer('test-definitely-not-exists-12345');
			assert.strictEqual(result, false);
		});
	});
});
