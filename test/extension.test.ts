/**
 * Extension Test Suite
 * Main test file that serves as an entry point for all tests
 */

import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Extension Test Suite', () => {
	vscode.window.showInformationMessage('Start all tests.');

	test('Extension should be present', () => {
		assert.ok(vscode.extensions.getExtension('Mattia Gaggi.claude-custom-chat'));
	});

	test('Extension should activate', async () => {
		const ext = vscode.extensions.getExtension('Mattia Gaggi.claude-custom-chat');
		if (ext) {
			await ext.activate();
			assert.strictEqual(ext.isActive, true);
		}
	});

	test('Commands should be registered', async () => {
		const commands = await vscode.commands.getCommands(true);

		const expectedCommands = [
			'claude-custom-chat.openChat',
			'claude-custom-chat.openChat1',
			'claude-custom-chat.openChat2',
			'claude-custom-chat.openChat3'
		];

		expectedCommands.forEach(cmd => {
			assert.ok(commands.includes(cmd), `Command ${cmd} should be registered`);
		});
	});
});
