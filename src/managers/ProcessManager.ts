/**
 * ProcessManager - Handles Claude process lifecycle
 * Responsibilities:
 * - Spawning Claude processes (native or WSL)
 * - Managing process I/O streams
 * - Process termination and cleanup
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

export class ProcessManager {
	private _currentProcess: cp.ChildProcess | undefined;
	private _abortController: AbortController | undefined;
	private _isWslProcess: boolean = false;
	private _wslDistro: string = 'Ubuntu';

	/**
	 * Spawn a new Claude process
	 */
	public async spawn(config: ProcessConfig): Promise<cp.ChildProcess> {
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
		return process;
	}

	/**
	 * Spawn Claude in WSL
	 */
	private _spawnWSL(config: ProcessConfig): cp.ChildProcess {
		const wslCommand = `"${config.nodePath}" --no-warnings --enable-source-maps "${config.claudePath}" ${config.args.join(' ')}`;

		return cp.spawn('wsl', ['-d', config.wslDistro, 'bash', '-ic', wslCommand], {
			signal: this._abortController!.signal,
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
	private _spawnNative(config: ProcessConfig): cp.ChildProcess {
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

		return cp.spawn(claudeCommand, config.args, {
			// Remove signal for now to debug
			// signal: this._abortController!.signal,
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
	 * Write to process stdin
	 */
	public write(data: string): boolean {
		if (!this._currentProcess?.stdin || this._currentProcess.stdin.destroyed) {
			return false;
		}
		this._currentProcess.stdin.write(data);
		return true;
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
	 * Dispose and cleanup
	 */
	public dispose(): void {
		if (this._currentProcess) {
			this.terminate('SIGKILL');
		}
	}
}
