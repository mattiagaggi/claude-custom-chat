/**
 * ProcessKiller.ts - Cross-Platform Process Termination
 *
 * Provides reliable process termination across Windows, Mac, and Linux.
 * Handles process groups and child processes to ensure clean shutdown.
 * Uses `taskkill` on Windows and `kill` signals on Unix systems.
 */

import { promisify } from 'util';
import { exec as execCallback } from 'child_process';

const exec = promisify(execCallback);

/**
 * Kill a process group across different platforms
 */
export async function killProcessGroup(
	pid: number,
	signal: string = 'SIGTERM',
	isWSL: boolean = false,
	wslDistro?: string
): Promise<void> {
	if (isWSL && wslDistro) {
		// WSL: Kill processes inside WSL using pkill
		try {
			const killSignal = signal === 'SIGKILL' ? '-9' : '-15';
			await exec(`wsl -d ${wslDistro} pkill ${killSignal} -f "claude"`);
		} catch {
			// Process may already be dead or pkill not available
		}
		// Also kill the Windows-side wsl process
		try {
			await exec(`taskkill /pid ${pid} /t /f`);
		} catch {
			// Process may already be dead
		}
	} else if (process.platform === 'win32') {
		// Windows: Use taskkill with /T flag for tree kill
		try {
			await exec(`taskkill /pid ${pid} /t /f`);
		} catch {
			// Process may already be dead
		}
	} else {
		// Unix: Kill process group with negative PID
		try {
			process.kill(-pid, signal as NodeJS.Signals);
		} catch {
			// Process may already be dead
		}
	}
}
