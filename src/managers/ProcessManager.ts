/**
 * ProcessManager.ts - Claude CLI Process Lifecycle Manager
 *
 * Manages the Claude CLI child process:
 * - Spawning processes (native Windows/Mac/Linux or WSL)
 * - Writing to stdin (sending messages to Claude)
 * - Managing stdout/stderr streams
 * - Process termination and cleanup (cross-platform kill)
 */

import * as cp from 'child_process';
import * as vscode from 'vscode';
import { killProcessGroup } from '../utils';

export interface ProcessConfig {
	args: string[];
	cwd: string;
	wslEnabled: boolean;
	wslDistro: string;
	nodePath: string;
	claudePath: string;
}

interface ProcessInfo {
	process: cp.ChildProcess;
	abortController: AbortController;
	isWslProcess: boolean;
	wslDistro: string;
	conversationId: string;
}

export class ProcessManager {
	private _currentProcess: cp.ChildProcess | undefined;
	private _abortController: AbortController | undefined;
	private _isWslProcess: boolean = false;
	private _wslDistro: string = 'Ubuntu';

	// Support for multiple processes
	private _processes: Map<string, ProcessInfo> = new Map();

	/**
	 * Spawn a new Claude process
	 */
	public async spawn(config: ProcessConfig, conversationId?: string): Promise<cp.ChildProcess> {
		// Cancel any existing process
		if (this._currentProcess) {
			await this.terminate();
		}

		// Create new AbortController
		this._abortController = new AbortController();

		let process: cp.ChildProcess;

		if (config.wslEnabled) {
			process = this._spawnWSL(config);
			this._isWslProcess = true;
			this._wslDistro = config.wslDistro;
		} else {
			process = this._spawnNative(config);
			this._isWslProcess = false;
		}

		this._currentProcess = process;

		// If conversationId is provided, track this process separately
		if (conversationId) {
			this._processes.set(conversationId, {
				process,
				abortController: this._abortController,
				isWslProcess: this._isWslProcess,
				wslDistro: this._wslDistro,
				conversationId
			});
		}

		return process;
	}

	/**
	 * Spawn a new process for a specific conversation (doesn't affect current process)
	 */
	public async spawnForConversation(config: ProcessConfig, conversationId: string): Promise<cp.ChildProcess> {
		// Create new AbortController
		const abortController = new AbortController();

		let process: cp.ChildProcess;
		let isWslProcess: boolean;
		let wslDistro: string;

		if (config.wslEnabled) {
			process = this._spawnWSL(config, abortController);
			isWslProcess = true;
			wslDistro = config.wslDistro;
		} else {
			process = this._spawnNative(config, abortController);
			isWslProcess = false;
			wslDistro = config.wslDistro;
		}

		// Track this process
		this._processes.set(conversationId, {
			process,
			abortController,
			isWslProcess,
			wslDistro,
			conversationId
		});

		return process;
	}

	/**
	 * Spawn Claude in WSL
	 */
	private _spawnWSL(config: ProcessConfig, abortController?: AbortController): cp.ChildProcess {
		const wslCommand = `"${config.nodePath}" --no-warnings --enable-source-maps "${config.claudePath}" ${config.args.join(' ')}`;
		const controller = abortController || this._abortController;

		return cp.spawn('wsl', ['-d', config.wslDistro, 'bash', '-ic', wslCommand], {
			signal: controller!.signal,
			detached: process.platform !== 'win32',
			cwd: config.cwd,
			stdio: ['pipe', 'pipe', 'pipe'],
			env: {
				...process.env,
				FORCE_COLOR: '0',
				NO_COLOR: '1'
			}
		});
	}

	/**
	 * Spawn Claude natively
	 */
	private _spawnNative(config: ProcessConfig, abortController?: AbortController): cp.ChildProcess {
		// Find claude command location
		let claudeCommand = 'claude';
		if (process.platform === 'darwin') {
			const fs = require('fs');
			if (fs.existsSync('/opt/homebrew/bin/claude')) {
				claudeCommand = '/opt/homebrew/bin/claude';
			} else if (fs.existsSync('/usr/local/bin/claude')) {
				claudeCommand = '/usr/local/bin/claude';
			}
		}

		console.log('[ProcessManager] Spawning Claude:', claudeCommand, config.args);
		const controller = abortController || this._abortController;

		return cp.spawn(claudeCommand, config.args, {
			// Remove signal for now to debug
			// signal: controller?.signal,
			shell: process.platform === 'win32',
			detached: process.platform !== 'win32',
			cwd: config.cwd,
			stdio: ['pipe', 'pipe', 'pipe'],
			env: {
				...process.env,
				PATH: `${process.env.PATH || ''}:/opt/homebrew/bin:/usr/local/bin`,
				HOME: process.env.HOME || require('os').homedir(),
				USER: process.env.USER,
				FORCE_COLOR: '0',
				NO_COLOR: '1'
			}
		});
	}

	/**
	 * Write to process stdin (uses current process)
	 */
	public write(data: string): boolean {
		if (!this._currentProcess?.stdin || this._currentProcess.stdin.destroyed) {
			console.error('[ProcessManager] Cannot write: stdin is unavailable or destroyed');
			return false;
		}

		const stdin = this._currentProcess.stdin;
		console.log('[ProcessManager] Stdin state:', {
			writable: stdin.writable,
			writableEnded: stdin.writableEnded,
			writableFinished: stdin.writableFinished,
			destroyed: stdin.destroyed,
			closed: stdin.closed
		});

		console.log('[ProcessManager] Writing to stdin (length:', data.length, '):', data.substring(0, 200));
		console.log('[ProcessManager] Full data to write:', data);

		try {
			const result = stdin.write(data, 'utf8', (error) => {
				if (error) {
					console.error('[ProcessManager] Error writing to stdin:', error);
				} else {
					console.log('[ProcessManager] Successfully wrote to stdin, data was:', data.substring(0, 100));
				}
			});

			console.log('[ProcessManager] Write returned:', result);

			// Force flush the buffer
			if (!result) {
				console.warn('[ProcessManager] Write returned false (buffer full), waiting for drain');
				stdin.once('drain', () => {
					console.log('[ProcessManager] Stdin buffer drained');
				});
			}

			return true;
		} catch (error) {
			console.error('[ProcessManager] Exception writing to stdin:', error);
			return false;
		}
	}

	/**
	 * Terminate current process
	 */
	public async terminate(signal: string = 'SIGTERM'): Promise<void> {
		if (!this._currentProcess) {
			return;
		}

		const pid = this._currentProcess.pid;
		if (!pid) {
			return;
		}

		// Abort if controller exists
		if (this._abortController) {
			this._abortController.abort();
		}

		// Kill process group
		await killProcessGroup(pid, signal, this._isWslProcess, this._wslDistro);

		// Cleanup
		this._currentProcess = undefined;
		this._abortController = undefined;
	}

	/**
	 * Get current process
	 */
	public getCurrentProcess(): cp.ChildProcess | undefined {
		return this._currentProcess;
	}

	/**
	 * Check if process is running
	 */
	public isRunning(): boolean {
		return this._currentProcess !== undefined && !this._currentProcess.killed;
	}

	/**
	 * Write to a specific conversation's process
	 */
	public writeToConversation(conversationId: string, data: string): boolean {
		const processInfo = this._processes.get(conversationId);
		if (!processInfo?.process?.stdin || processInfo.process.stdin.destroyed) {
			console.error('[ProcessManager] Cannot write to conversation:', conversationId, '- stdin unavailable');
			return false;
		}

		const stdin = processInfo.process.stdin;
		console.log('[ProcessManager] Writing to conversation', conversationId, '(length:', data.length, ')');

		try {
			const result = stdin.write(data, 'utf8', (error) => {
				if (error) {
					console.error('[ProcessManager] Error writing to conversation:', conversationId, error);
				} else {
					console.log('[ProcessManager] Successfully wrote to conversation:', conversationId);
				}
			});

			if (!result) {
				console.warn('[ProcessManager] Write buffer full for conversation:', conversationId);
				stdin.once('drain', () => {
					console.log('[ProcessManager] Stdin drained for conversation:', conversationId);
				});
			}

			return true;
		} catch (error) {
			console.error('[ProcessManager] Exception writing to conversation:', conversationId, error);
			return false;
		}
	}

	/**
	 * Get process for a specific conversation
	 */
	public getProcessForConversation(conversationId: string): cp.ChildProcess | undefined {
		return this._processes.get(conversationId)?.process;
	}

	/**
	 * Check if a conversation has a running process
	 */
	public isConversationRunning(conversationId: string): boolean {
		const processInfo = this._processes.get(conversationId);
		return processInfo !== undefined && !processInfo.process.killed;
	}

	/**
	 * Terminate a specific conversation's process
	 */
	public async terminateConversation(conversationId: string, signal: string = 'SIGTERM'): Promise<void> {
		const processInfo = this._processes.get(conversationId);
		if (!processInfo) {
			return;
		}

		const pid = processInfo.process.pid;
		if (!pid) {
			this._processes.delete(conversationId);
			return;
		}

		// Abort if controller exists
		if (processInfo.abortController) {
			processInfo.abortController.abort();
		}

		// Kill process group
		await killProcessGroup(pid, signal, processInfo.isWslProcess, processInfo.wslDistro);

		// Cleanup
		this._processes.delete(conversationId);
	}

	/**
	 * Terminate all conversation processes
	 */
	public async terminateAllConversations(): Promise<void> {
		const terminatePromises = Array.from(this._processes.keys()).map(id =>
			this.terminateConversation(id)
		);
		await Promise.all(terminatePromises);
	}

	/**
	 * Get all active conversation IDs with processes
	 */
	public getActiveConversationIds(): string[] {
		return Array.from(this._processes.keys());
	}

	/**
	 * Dispose and cleanup
	 */
	public async dispose(): Promise<void> {
		// Terminate all conversation processes
		await this.terminateAllConversations();

		// Terminate current process
		if (this._currentProcess) {
			await this.terminate('SIGKILL');
		}
	}
}
