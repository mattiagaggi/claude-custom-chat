/**
 * SlashCommandHandler.ts - Slash Command Routing
 *
 * Handles slash commands typed in chat (e.g., /help, /doctor, /clear).
 * Routes to CLI execution, terminal commands, or prompt-based tasks.
 */

import { openTerminal } from './VSCodeUtilities';

export interface SlashCommandDeps {
	postMessage: (msg: any) => void;
	newSession: () => Promise<void>;
	sendCurrentUsage: () => void;
	addMessage: (type: string, data: string, convId?: string) => void;
	getCurrentConversationId: () => string | undefined;
	sendRegularMessage: (message: string) => Promise<void>;
}

export class SlashCommandHandler {
	constructor(private deps: SlashCommandDeps) {}

	async execute(command: string) {
		const cliCommands: Record<string, string[]> = {
			'help': ['--help'],
			'doctor': ['doctor'],
			'config': ['config'],
			'mcp': ['mcp'],
			'status': ['status'],
			'model': ['model'],
			'permissions': ['permissions'],
			'agents': ['agents']
		};

		if (command === 'clear') {
			await this.deps.newSession();
			return;
		}

		if (command === 'cost' || command === 'usage') {
			this.deps.sendCurrentUsage();
			this.deps.postMessage({ type: 'assistantMessage', data: '_Use the usage panel in the header to see detailed costs._' });
			return;
		}

		const terminalCommands = ['login', 'logout', 'init', 'terminal-setup', 'vim'];
		if (terminalCommands.includes(command)) {
			openTerminal(`Claude ${command}`, `claude ${command}`);
			this.deps.postMessage({ type: 'assistantMessage', data: `_Opening terminal for \`claude ${command}\`..._` });
			return;
		}

		if (cliCommands[command]) {
			await this.runClaudeCommandInChat(cliCommands[command]);
			return;
		}

		const promptCommands = ['bug', 'review', 'pr_comments', 'add-dir', 'memory', 'compact', 'rewind'];
		if (promptCommands.includes(command)) {
			this.deps.postMessage({ type: 'userInput', data: `/${command}` });
			this.deps.addMessage('userInput', `/${command}`, this.deps.getCurrentConversationId());
			await this.deps.sendRegularMessage(`Please help me with the /${command} task`);
			return;
		}

		const availableCommands = [
			...Object.keys(cliCommands),
			'clear', 'cost', 'usage',
			...terminalCommands,
			...promptCommands
		].sort().join(', ');
		this.deps.postMessage({
			type: 'assistantMessage',
			data: `Unknown command \`/${command}\`. Available commands: ${availableCommands}`
		});
	}

	private async runClaudeCommandInChat(args: string[]) {
		const cp = require('child_process');

		let claudeCommand = 'claude';
		if (process.platform === 'darwin') {
			const fs = require('fs');
			if (fs.existsSync('/opt/homebrew/bin/claude')) {
				claudeCommand = '/opt/homebrew/bin/claude';
			} else if (fs.existsSync('/usr/local/bin/claude')) {
				claudeCommand = '/usr/local/bin/claude';
			}
		}

		this.deps.postMessage({ type: 'loading', data: `Running \`claude ${args.join(' ')}\`...` });

		try {
			const result = await new Promise<string>((resolve, reject) => {
				cp.execFile(claudeCommand, args, {
					timeout: 30000,
					maxBuffer: 1024 * 1024,
					env: {
						...process.env,
						PATH: `${process.env.PATH || ''}:/opt/homebrew/bin:/usr/local/bin`,
						FORCE_COLOR: '0',
						NO_COLOR: '1'
					}
				}, (error: any, stdout: string, stderr: string) => {
					if (error && !stdout) {
						reject(new Error(stderr || error.message));
					} else {
						resolve(stdout || stderr);
					}
				});
			});

			this.deps.postMessage({ type: 'clearLoading' });
			const formattedOutput = '```\n' + result.trim() + '\n```';
			this.deps.postMessage({ type: 'assistantMessage', data: formattedOutput });
			this.deps.addMessage('assistantMessage', formattedOutput, this.deps.getCurrentConversationId());
		} catch (error: any) {
			this.deps.postMessage({ type: 'clearLoading' });
			this.deps.postMessage({ type: 'error', data: `Command failed: ${error.message}` });
		}
	}
}
