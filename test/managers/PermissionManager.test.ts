/**
 * PermissionManager Unit Tests
 * Tests permission handling, auto-approval logic, and permission storage
 */

import * as assert from 'assert';
import { PermissionManager, PendingPermission, StoredPermission } from '../../src/managers/PermissionManager';

// Mock vscode context
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

suite('PermissionManager Tests', () => {

	suite('Pending Request Management', () => {
		test('Should add pending request', () => {
			const manager = new PermissionManager(mockContext as any);
			const request: PendingPermission = {
				requestId: 'req-123',
				toolName: 'Bash',
				input: { command: 'ls -la' },
				toolUseId: 'tool-456'
			};

			manager.addPendingRequest('req-123', request);
			const retrieved = manager.getPendingRequest('req-123');

			assert.ok(retrieved);
			assert.strictEqual(retrieved!.requestId, 'req-123');
			assert.strictEqual(retrieved!.toolName, 'Bash');
		});

		test('Should get pending request by ID', () => {
			const manager = new PermissionManager(mockContext as any);
			const request: PendingPermission = {
				requestId: 'req-abc',
				toolName: 'Read',
				input: { file_path: '/test.ts' },
				toolUseId: 'tool-xyz'
			};

			manager.addPendingRequest('req-abc', request);
			const result = manager.getPendingRequest('req-abc');

			assert.ok(result);
			assert.deepStrictEqual(result!.input, { file_path: '/test.ts' });
		});

		test('Should return undefined for non-existent request', () => {
			const manager = new PermissionManager(mockContext as any);
			const result = manager.getPendingRequest('non-existent');

			assert.strictEqual(result, undefined);
		});

		test('Should remove pending request', () => {
			const manager = new PermissionManager(mockContext as any);
			const request: PendingPermission = {
				requestId: 'req-remove',
				toolName: 'Bash',
				input: { command: 'echo test' },
				toolUseId: 'tool-1'
			};

			manager.addPendingRequest('req-remove', request);
			assert.ok(manager.getPendingRequest('req-remove'));

			manager.removePendingRequest('req-remove');
			assert.strictEqual(manager.getPendingRequest('req-remove'), undefined);
		});

		test('Should cancel all pending requests', () => {
			const manager = new PermissionManager(mockContext as any);

			// Add multiple requests
			for (let i = 0; i < 5; i++) {
				manager.addPendingRequest(`req-${i}`, {
					requestId: `req-${i}`,
					toolName: 'Bash',
					input: { command: `cmd ${i}` },
					toolUseId: `tool-${i}`
				});
			}

			manager.cancelAllPending();

			// All should be removed
			for (let i = 0; i < 5; i++) {
				assert.strictEqual(manager.getPendingRequest(`req-${i}`), undefined);
			}
		});
	});

	suite('Auto-Approval Logic', () => {
		test('Should not auto-approve when no permissions stored', () => {
			const manager = new PermissionManager(mockContext as any);
			const result = manager.shouldAutoApprove('Bash', { command: 'ls' });

			assert.strictEqual(result, false);
		});

		test('Should auto-approve matching Bash command', async () => {
			const manager = new PermissionManager(mockContext as any);
			await manager.addAlwaysAllowPermission('Bash', { command: 'npm test' });

			const result = manager.shouldAutoApprove('Bash', { command: 'npm test' });

			assert.strictEqual(result, true);
		});

		test('Should not auto-approve non-matching command', async () => {
			const manager = new PermissionManager(mockContext as any);
			await manager.addAlwaysAllowPermission('Bash', { command: 'npm test' });

			const result = manager.shouldAutoApprove('Bash', { command: 'npm install' });

			assert.strictEqual(result, false);
		});

		test('Should auto-approve matching file path for Read', async () => {
			const manager = new PermissionManager(mockContext as any);
			await manager.addAlwaysAllowPermission('Read', { file_path: '/src/index.ts' });

			const result = manager.shouldAutoApprove('Read', { file_path: '/src/index.ts' });

			assert.strictEqual(result, true);
		});

		test('Should auto-approve matching file path for Write', async () => {
			const manager = new PermissionManager(mockContext as any);
			await manager.addAlwaysAllowPermission('Write', { file_path: '/src/test.ts' });

			const result = manager.shouldAutoApprove('Write', { file_path: '/src/test.ts' });

			assert.strictEqual(result, true);
		});

		test('Should auto-approve matching file path for Edit', async () => {
			const manager = new PermissionManager(mockContext as any);
			await manager.addAlwaysAllowPermission('Edit', { file_path: '/src/utils.ts' });

			const result = manager.shouldAutoApprove('Edit', { file_path: '/src/utils.ts' });

			assert.strictEqual(result, true);
		});

		test('Should not auto-approve different tool with same command', async () => {
			const manager = new PermissionManager(mockContext as any);
			await manager.addAlwaysAllowPermission('Bash', { command: 'test' });

			const result = manager.shouldAutoApprove('Read', { command: 'test' });

			assert.strictEqual(result, false);
		});

		test('Should return false for unknown tool types', () => {
			const manager = new PermissionManager(mockContext as any);
			const result = manager.shouldAutoApprove('UnknownTool', { something: 'value' });

			assert.strictEqual(result, false);
		});
	});

	suite('Permission Storage', () => {
		test('Should add always-allow permission', async () => {
			const manager = new PermissionManager(mockContext as any);
			await manager.addAlwaysAllowPermission('Bash', { command: 'npm run build' });

			const permissions = manager.getAllPermissions();

			assert.ok(permissions.length > 0);
			assert.ok(permissions.some(p => p.toolName === 'Bash' && p.pattern === 'npm run build'));
		});

		test('Should not add duplicate permissions', async () => {
			const manager = new PermissionManager(mockContext as any);
			await manager.addAlwaysAllowPermission('Bash', { command: 'same-command' });
			await manager.addAlwaysAllowPermission('Bash', { command: 'same-command' });

			const permissions = manager.getAllPermissions();
			const matchingCount = permissions.filter(
				p => p.toolName === 'Bash' && p.pattern === 'same-command'
			).length;

			assert.strictEqual(matchingCount, 1);
		});

		test('Should remove permission', async () => {
			const manager = new PermissionManager(mockContext as any);
			await manager.addAlwaysAllowPermission('Bash', { command: 'to-remove' });

			const beforeRemove = manager.getAllPermissions();
			assert.ok(beforeRemove.some(p => p.pattern === 'to-remove'));

			await manager.removePermission('Bash', 'to-remove');

			const afterRemove = manager.getAllPermissions();
			assert.ok(!afterRemove.some(p => p.pattern === 'to-remove'));
		});

		test('Should get all permissions as copy', () => {
			const manager = new PermissionManager(mockContext as any);
			const permissions1 = manager.getAllPermissions();
			const permissions2 = manager.getAllPermissions();

			// Should be different array instances
			assert.notStrictEqual(permissions1, permissions2);
		});
	});

	suite('Command Extraction', () => {
		test('Should extract command from Bash input', () => {
			const manager = new PermissionManager(mockContext as any);
			// Access private method via prototype
			const command = (manager as any)._extractCommand('Bash', { command: 'npm install' });

			assert.strictEqual(command, 'npm install');
		});

		test('Should extract file_path from Read input', () => {
			const manager = new PermissionManager(mockContext as any);
			const command = (manager as any)._extractCommand('Read', { file_path: '/test/file.ts' });

			assert.strictEqual(command, '/test/file.ts');
		});

		test('Should extract file_path from Write input', () => {
			const manager = new PermissionManager(mockContext as any);
			const command = (manager as any)._extractCommand('Write', { file_path: '/output.txt', content: 'data' });

			assert.strictEqual(command, '/output.txt');
		});

		test('Should extract file_path from Edit input', () => {
			const manager = new PermissionManager(mockContext as any);
			const command = (manager as any)._extractCommand('Edit', { file_path: '/src/index.ts', old_string: 'a', new_string: 'b' });

			assert.strictEqual(command, '/src/index.ts');
		});

		test('Should return null for unknown tool', () => {
			const manager = new PermissionManager(mockContext as any);
			const command = (manager as any)._extractCommand('UnknownTool', { data: 'value' });

			assert.strictEqual(command, null);
		});

		test('Should return null for missing command field', () => {
			const manager = new PermissionManager(mockContext as any);
			const command = (manager as any)._extractCommand('Bash', { other: 'field' });

			assert.strictEqual(command, null);
		});
	});

	suite('Pattern Matching', () => {
		test('Should match exact command', () => {
			const manager = new PermissionManager(mockContext as any);
			const result = (manager as any)._matchesPattern('npm test', 'npm test');

			assert.strictEqual(result, true);
		});

		test('Should not match different commands', () => {
			const manager = new PermissionManager(mockContext as any);
			const result = (manager as any)._matchesPattern('npm test', 'npm install');

			assert.strictEqual(result, false);
		});

		test('Should not match partial commands', () => {
			const manager = new PermissionManager(mockContext as any);
			const result = (manager as any)._matchesPattern('npm test --coverage', 'npm test');

			assert.strictEqual(result, false);
		});
	});

	suite('Pending Permission Data Structure', () => {
		test('Should preserve all fields in pending permission', () => {
			const manager = new PermissionManager(mockContext as any);
			const request: PendingPermission = {
				requestId: 'req-full',
				toolName: 'Bash',
				input: { command: 'complex command', description: 'Does something' },
				suggestions: [{ type: 'allow' }, { type: 'deny' }],
				toolUseId: 'tool-full-123'
			};

			manager.addPendingRequest('req-full', request);
			const retrieved = manager.getPendingRequest('req-full');

			assert.deepStrictEqual(retrieved, request);
		});

		test('Should handle pending permission without suggestions', () => {
			const manager = new PermissionManager(mockContext as any);
			const request: PendingPermission = {
				requestId: 'req-no-suggest',
				toolName: 'Read',
				input: { file_path: '/test.ts' },
				toolUseId: 'tool-123'
			};

			manager.addPendingRequest('req-no-suggest', request);
			const retrieved = manager.getPendingRequest('req-no-suggest');

			assert.ok(retrieved);
			assert.strictEqual(retrieved!.suggestions, undefined);
		});
	});

	suite('Multiple Tool Type Permissions', () => {
		test('Should handle permissions for multiple tools', async () => {
			const manager = new PermissionManager(mockContext as any);

			await manager.addAlwaysAllowPermission('Bash', { command: 'npm test' });
			await manager.addAlwaysAllowPermission('Read', { file_path: '/src/index.ts' });
			await manager.addAlwaysAllowPermission('Write', { file_path: '/output.json' });

			assert.strictEqual(manager.shouldAutoApprove('Bash', { command: 'npm test' }), true);
			assert.strictEqual(manager.shouldAutoApprove('Read', { file_path: '/src/index.ts' }), true);
			assert.strictEqual(manager.shouldAutoApprove('Write', { file_path: '/output.json' }), true);

			// Non-matching should fail
			assert.strictEqual(manager.shouldAutoApprove('Bash', { command: 'other' }), false);
			assert.strictEqual(manager.shouldAutoApprove('Read', { file_path: '/other.ts' }), false);
		});
	});
});
