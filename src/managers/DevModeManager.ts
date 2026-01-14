/**
 * DevModeManager - Enables self-modification of the extension
 *
 * Allows Claude Code to modify its own source code, compile, and hot-reload
 * in a safe, controlled manner with rollback capabilities.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface DevModeSnapshot {
    timestamp: number;
    branch: string;
    commitHash: string;
    files: Map<string, string>; // filepath -> content
}

interface SerializedSnapshot {
    timestamp: number;
    branch: string;
    commitHash: string;
    files: [string, string][]; // Array of tuples for JSON serialization
}

export class DevModeManager {
    private isDevModeActive: boolean = false;
    private extensionPath: string;
    private sourceWatcher?: vscode.FileSystemWatcher;
    private compileTimeout?: NodeJS.Timeout;
    private snapshots: DevModeSnapshot[] = [];
    private safetyBranch?: string;
    private outputChannel: vscode.OutputChannel;
    private reloadCallback?: () => Promise<void>;

    constructor(extensionPath: string) {
        this.extensionPath = extensionPath;
        this.outputChannel = vscode.window.createOutputChannel('Dev Mode');
        this.loadSnapshotsFromDisk();
    }

    /**
     * Set callback to be called before reload (for saving state)
     */
    setReloadCallback(callback: () => Promise<void>): void {
        this.reloadCallback = callback;
    }

    /**
     * Enable Dev Mode - allows self-modification
     */
    async enableDevMode(): Promise<void> {
        if (this.isDevModeActive) {
            this.log('Dev Mode already active');
            return;
        }

        this.log('🛠️ Enabling Dev Mode...');

        // Detect if this is an installed extension vs development
        const isInstalledExtension = this.extensionPath.includes('.vscode/extensions') ||
                                     this.extensionPath.includes('.vscode-insiders/extensions') ||
                                     this.extensionPath.includes('.cursor/extensions') ||
                                     this.extensionPath.includes('.cursor-insiders/extensions') ||
                                     this.extensionPath.includes('.antigravity/extensions') ||
                                     this.extensionPath.includes('\\Microsoft VS Code\\extensions') ||
                                     this.extensionPath.includes('\\Microsoft VS Code Insiders\\extensions');

        if (isInstalledExtension) {
            this.log('Running in installed extension mode');
        } else {
            this.log('Running in development mode');
        }

        // Create snapshot before enabling (for rollback)
        await this.createSnapshot();

        // Ask user if they want to create a safety branch
        const createBranch = await vscode.window.showQuickPick(
            ['No, stay on current branch', 'Yes, create safety branch'],
            { placeHolder: 'Create a safety branch for dev mode changes?' }
        );

        if (createBranch === 'Yes, create safety branch') {
            await this.createSafetyBranch();
        }

        // Start watching source files
        this.startSourceWatcher();

        // Configure MCP server for extension source access
        // Provides a tool that Claude can call to get extension source code
        await this.configureMCPServer();

        this.isDevModeActive = true;
        this.log('✅ Dev Mode enabled - Extension is now self-modifiable!');

        vscode.window.showInformationMessage(
            '🛠️ Dev Mode enabled! Claude Code can now modify its own source code.',
            'View Docs'
        );
    }

    /**
     * Disable Dev Mode - stops self-modification
     */
    async disableDevMode(rollback: boolean = false): Promise<void> {
        if (!this.isDevModeActive) {
            return;
        }

        this.log('Disabling Dev Mode...');

        // Stop watching files
        this.stopSourceWatcher();

        // Remove MCP server configuration
        await this.removeMCPServer();

        if (rollback && this.snapshots.length > 0) {
            await this.rollbackToSnapshot(this.snapshots[this.snapshots.length - 1]);
        }

        this.isDevModeActive = false;
        this.log('✅ Dev Mode disabled');

        vscode.window.showInformationMessage('Dev Mode disabled');
    }

    /**
     * Check if Dev Mode is active
     */
    isActive(): boolean {
        return this.isDevModeActive;
    }

    /**
     * Get extension source code for context
     */
    async getSourceCodeContext(): Promise<string> {
        const srcPath = path.join(this.extensionPath, 'src');
        const files = await this.getAllSourceFiles(srcPath);

        let context = '# Extension Source Code\n\n';
        context += `Extension Path: ${this.extensionPath}\n\n`;
        context += '## File Structure:\n';

        for (const file of files) {
            const relativePath = path.relative(this.extensionPath, file);
            context += `- ${relativePath}\n`;
        }

        context += '\n## Key Files:\n\n';

        // Include important files in full
        const keyFiles = [
            'src/extension.ts',
            'src/ui.ts',
            'package.json'
        ];

        for (const keyFile of keyFiles) {
            const filePath = path.join(this.extensionPath, keyFile);
            if (fs.existsSync(filePath)) {
                const content = fs.readFileSync(filePath, 'utf8');
                context += `### ${keyFile}\n\`\`\`typescript\n${content}\n\`\`\`\n\n`;
            }
        }

        return context;
    }

    /**
     * Create a snapshot of current state
     */
    private async createSnapshot(): Promise<DevModeSnapshot> {
        this.log('Creating snapshot...');

        const snapshot: DevModeSnapshot = {
            timestamp: Date.now(),
            branch: await this.getCurrentBranch(),
            commitHash: await this.getCurrentCommit(),
            files: new Map()
        };

        // Save all source files
        const srcPath = path.join(this.extensionPath, 'src');
        const files = await this.getAllSourceFiles(srcPath);

        for (const file of files) {
            const content = fs.readFileSync(file, 'utf8');
            const relativePath = path.relative(this.extensionPath, file);
            snapshot.files.set(relativePath, content);
        }

        this.snapshots.push(snapshot);
        this.saveSnapshotToDisk(snapshot);
        this.log(`Snapshot created: ${snapshot.files.size} files`);

        return snapshot;
    }

    /**
     * Get path to snapshots directory
     */
    private getSnapshotsDir(): string {
        const snapshotsDir = path.join(this.extensionPath, '.devmode-snapshots');
        if (!fs.existsSync(snapshotsDir)) {
            fs.mkdirSync(snapshotsDir, { recursive: true });
        }
        return snapshotsDir;
    }

    /**
     * Save a snapshot to disk
     */
    private saveSnapshotToDisk(snapshot: DevModeSnapshot): void {
        try {
            const snapshotsDir = this.getSnapshotsDir();
            const filename = `snapshot-${snapshot.timestamp}.json`;
            const filepath = path.join(snapshotsDir, filename);

            // Convert Map to array for JSON serialization
            const serialized: SerializedSnapshot = {
                timestamp: snapshot.timestamp,
                branch: snapshot.branch,
                commitHash: snapshot.commitHash,
                files: Array.from(snapshot.files.entries())
            };

            fs.writeFileSync(filepath, JSON.stringify(serialized, null, 2), 'utf8');
            this.log(`Snapshot saved to disk: ${filename}`);
        } catch (error) {
            this.log(`Warning: Could not save snapshot to disk: ${error}`);
        }
    }

    /**
     * Load snapshots from disk
     */
    private loadSnapshotsFromDisk(): void {
        try {
            const snapshotsDir = this.getSnapshotsDir();

            if (!fs.existsSync(snapshotsDir)) {
                return;
            }

            const files = fs.readdirSync(snapshotsDir)
                .filter(f => f.startsWith('snapshot-') && f.endsWith('.json'))
                .sort(); // Sort by filename (which includes timestamp)

            for (const file of files) {
                try {
                    const filepath = path.join(snapshotsDir, file);
                    const content = fs.readFileSync(filepath, 'utf8');
                    const serialized: SerializedSnapshot = JSON.parse(content);

                    // Convert array back to Map
                    const snapshot: DevModeSnapshot = {
                        timestamp: serialized.timestamp,
                        branch: serialized.branch,
                        commitHash: serialized.commitHash,
                        files: new Map(serialized.files)
                    };

                    this.snapshots.push(snapshot);
                } catch (error) {
                    this.log(`Warning: Could not load snapshot ${file}: ${error}`);
                }
            }

            if (this.snapshots.length > 0) {
                this.log(`Loaded ${this.snapshots.length} snapshot(s) from disk`);
            }
        } catch (error) {
            this.log(`Warning: Could not load snapshots from disk: ${error}`);
        }
    }

    /**
     * Rollback to a previous snapshot
     */
    private async rollbackToSnapshot(snapshot: DevModeSnapshot): Promise<void> {
        this.log(`Rolling back to snapshot from ${new Date(snapshot.timestamp).toISOString()}...`);

        for (const [relativePath, content] of snapshot.files) {
            const filePath = path.join(this.extensionPath, relativePath);
            const dir = path.dirname(filePath);

            // Ensure directory exists
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }

            fs.writeFileSync(filePath, content, 'utf8');
        }

        // Recompile
        await this.compile();

        this.log('✅ Rollback complete');

        // Prompt to reload window so changes take effect
        const action = await vscode.window.showInformationMessage(
            'Rollback complete. Reload window to apply changes.',
            'Reload Now'
        );

        if (action === 'Reload Now') {
            vscode.commands.executeCommand('workbench.action.reloadWindow');
        }
    }

    /**
     * Rollback to the latest snapshot (public method)
     */
    async rollbackToLatestSnapshot(): Promise<void> {
        if (this.snapshots.length === 0) {
            vscode.window.showWarningMessage('No snapshots available to rollback to');
            return;
        }

        const latestSnapshot = this.snapshots[this.snapshots.length - 1];
        const date = new Date(latestSnapshot.timestamp).toLocaleString();

        const confirm = await vscode.window.showWarningMessage(
            `Rollback to snapshot from ${date}?\n\nThis will restore all source files to their previous state.`,
            { modal: true },
            'Rollback',
            'Cancel'
        );

        if (confirm === 'Rollback') {
            await this.rollbackToSnapshot(latestSnapshot);
        }
    }

    /**
     * Show snapshot picker and rollback to selected snapshot
     */
    async pickAndRollbackSnapshot(): Promise<void> {
        if (this.snapshots.length === 0) {
            vscode.window.showWarningMessage('No snapshots available to rollback to');
            return;
        }

        // Create quick pick items
        const items = this.snapshots.map((snapshot, index) => ({
            label: `$(history) ${new Date(snapshot.timestamp).toLocaleString()}`,
            description: `${snapshot.branch} @ ${snapshot.commitHash.substring(0, 7)}`,
            detail: `${snapshot.files.size} files`,
            snapshot,
            index
        })).reverse(); // Show newest first

        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: 'Select a snapshot to rollback to',
            matchOnDescription: true,
            matchOnDetail: true
        });

        if (selected) {
            const confirm = await vscode.window.showWarningMessage(
                `Rollback to snapshot from ${new Date(selected.snapshot.timestamp).toLocaleString()}?\n\nThis will restore all source files to their previous state.`,
                { modal: true },
                'Rollback',
                'Cancel'
            );

            if (confirm === 'Rollback') {
                await this.rollbackToSnapshot(selected.snapshot);
            }
        }
    }

    /**
     * Clear all snapshots from disk and memory
     */
    async clearSnapshots(): Promise<void> {
        const confirm = await vscode.window.showWarningMessage(
            `Delete all ${this.snapshots.length} snapshot(s)?\n\nThis action cannot be undone.`,
            { modal: true },
            'Delete All',
            'Cancel'
        );

        if (confirm === 'Delete All') {
            try {
                const snapshotsDir = this.getSnapshotsDir();
                if (fs.existsSync(snapshotsDir)) {
                    fs.rmSync(snapshotsDir, { recursive: true, force: true });
                }
                this.snapshots = [];
                this.log('All snapshots cleared');
                vscode.window.showInformationMessage('All snapshots deleted');
            } catch (error) {
                this.log(`Error clearing snapshots: ${error}`);
                vscode.window.showErrorMessage(`Failed to clear snapshots: ${error}`);
            }
        }
    }

    /**
     * Create a safety branch for dev mode changes
     */
    private async createSafetyBranch(): Promise<void> {
        const timestamp = Date.now();
        const branchName = `dev-mode-${timestamp}`;

        try {
            await this.execGit(`checkout -b ${branchName}`);
            this.safetyBranch = branchName;
            this.log(`Created safety branch: ${branchName}`);
            vscode.window.showInformationMessage(`Created safety branch: ${branchName}`);
        } catch (error) {
            this.log(`Warning: Could not create safety branch: ${error}`);
            vscode.window.showWarningMessage(`Could not create safety branch: ${error}`);
        }
    }

    /**
     * Start watching source files for changes
     */
    private startSourceWatcher(): void {
        const srcPattern = new vscode.RelativePattern(
            this.extensionPath,
            'src/**/*.{ts,js,json}'
        );

        this.sourceWatcher = vscode.workspace.createFileSystemWatcher(srcPattern);

        this.sourceWatcher.onDidChange(() => this.onSourceChanged());
        this.sourceWatcher.onDidCreate(() => this.onSourceChanged());
        this.sourceWatcher.onDidDelete(() => this.onSourceChanged());

        this.log('Started watching source files');
    }

    /**
     * Stop watching source files
     */
    private stopSourceWatcher(): void {
        if (this.sourceWatcher) {
            this.sourceWatcher.dispose();
            this.sourceWatcher = undefined;
            this.log('Stopped watching source files');
        }
    }

    /**
     * Handle source file changes
     */
    private onSourceChanged(): void {
        this.log('Source file changed, scheduling compilation...');

        // Debounce compilation
        if (this.compileTimeout) {
            clearTimeout(this.compileTimeout);
        }

        this.compileTimeout = setTimeout(() => {
            this.compileAndReload();
        }, 1000); // Wait 1 second after last change
    }

    /**
     * Compile and reload the extension
     */
    private async compileAndReload(): Promise<void> {
        this.log('🔨 Compiling extension...');

        try {
            await this.compile();
            this.log('✅ Compilation successful');

            // Ask user before reloading to prevent breaking UI
            const choice = await vscode.window.showInformationMessage(
                '🔄 Extension compiled successfully! Reload to apply changes?',
                'Reload Now',
                'Reload Later',
                'Test First'
            );

            if (choice === 'Reload Now') {
                await this.reloadExtension(true);
            } else if (choice === 'Test First') {
                vscode.window.showInformationMessage(
                    'Review changes with "git diff", then reload manually when ready.',
                    'Show Diff',
                    'Reload Now'
                ).then(async (diffChoice) => {
                    if (diffChoice === 'Show Diff') {
                        vscode.commands.executeCommand('git.openChange');
                    } else if (diffChoice === 'Reload Now') {
                        await this.reloadExtension(true);
                    }
                });
            }
            // If "Reload Later", do nothing - user can reload manually
        } catch (error) {
            this.log(`❌ Compilation failed: ${error}`);
            vscode.window.showErrorMessage(
                '❌ Extension compilation failed. Changes NOT applied.',
                'View Output',
                'Rollback'
            ).then(async (choice) => {
                if (choice === 'View Output') {
                    this.outputChannel.show();
                } else if (choice === 'Rollback') {
                    await this.disableDevMode(true);
                }
            });
        }
    }

    /**
     * Compile the extension
     */
    private async compile(): Promise<void> {
        // Build comprehensive PATH with common npm installation locations
        const homedir = process.env.HOME || process.env.USERPROFILE || '';
        const commonPaths = [
            process.env.PATH || '',
            '/usr/local/bin',
            '/opt/homebrew/bin',  // Homebrew on Apple Silicon
            '/usr/bin',
            '/bin',
            `${homedir}/.nvm/versions/node/*/bin`,
            `${homedir}/.npm-global/bin`,
            `${homedir}/.yarn/bin`,
            '/opt/homebrew/opt/node/bin'
        ].filter(Boolean).join(':');

        // Try to get shell PATH as additional fallback
        let fullPath = commonPaths;
        try {
            const shell = process.env.SHELL || '/bin/bash';
            const pathCommand = shell.includes('fish')
                ? `${shell} -c 'echo $PATH'`
                : `${shell} -l -c 'echo $PATH'`;
            const { stdout: pathOutput } = await execAsync(pathCommand, { timeout: 2000 });
            if (pathOutput.trim()) {
                fullPath = `${commonPaths}:${pathOutput.trim()}`;
            }
        } catch (e) {
            this.log(`Using fallback PATH (shell PATH unavailable)`);
        }

        this.log(`Running: npm run compile with PATH=${fullPath.substring(0, 100)}...`);
        const { stdout, stderr } = await execAsync('npm run compile', {
            cwd: this.extensionPath,
            env: { ...process.env, PATH: fullPath },
            shell: '/bin/bash'
        });

        if (stderr) {
            this.log(`Compile stderr: ${stderr}`);
        }
        if (stdout) {
            this.log(`Compile stdout: ${stdout}`);
        }
    }

    /**
     * Reload the extension (soft reload - preserves UI state)
     */
    private async reloadExtension(skipPrompt: boolean = false): Promise<void> {
        this.log('🔄 Soft reloading extension (preserving UI state)...');

        // Call the callback to save state before reload
        if (this.reloadCallback) {
            try {
                await this.reloadCallback();
                this.log('State saved before reload');
            } catch (error) {
                this.log(`Warning: Could not save state before reload: ${error}`);
            }
        }

        // Show user-friendly notification (unless already prompted)
        let shouldReload = skipPrompt;
        if (!skipPrompt) {
            const choice = await vscode.window.showInformationMessage(
                '🔄 Extension code updated! Reload to apply changes?',
                'Reload Now',
                'Reload Later'
            );
            shouldReload = choice === 'Reload Now';
        }

        if (shouldReload) {
            try {
                // Restart extension host (this reloads the extension but preserves workspace)
                await vscode.commands.executeCommand('workbench.action.restartExtensionHost');
            } catch (error) {
                this.log(`Could not restart extension host: ${error}`);

                // Fallback: offer full reload
                const fullReload = await vscode.window.showWarningMessage(
                    'Could not restart extension. Try full window reload?',
                    'Reload Window',
                    'Cancel'
                );

                if (fullReload === 'Reload Window') {
                    await vscode.commands.executeCommand('workbench.action.reloadWindow');
                }
            }
        } else {
            this.log('User chose to reload later');
            vscode.window.showInformationMessage(
                '💡 Reload when ready to apply changes',
                'Reload Now'
            ).then(choice => {
                if (choice === 'Reload Now') {
                    vscode.commands.executeCommand('workbench.action.restartExtensionHost');
                }
            });
        }
    }

    /**
     * Get all source files recursively
     */
    private async getAllSourceFiles(dir: string): Promise<string[]> {
        const files: string[] = [];

        const items = fs.readdirSync(dir, { withFileTypes: true });

        for (const item of items) {
            const fullPath = path.join(dir, item.name);

            if (item.isDirectory()) {
                files.push(...await this.getAllSourceFiles(fullPath));
            } else if (item.isFile() && /\.(ts|js|json)$/.test(item.name)) {
                files.push(fullPath);
            }
        }

        return files;
    }

    /**
     * Execute git command
     */
    private async execGit(command: string): Promise<string> {
        const { stdout } = await execAsync(`git ${command}`, {
            cwd: this.extensionPath
        });
        return stdout.trim();
    }

    /**
     * Get current git branch
     */
    private async getCurrentBranch(): Promise<string> {
        try {
            return await this.execGit('rev-parse --abbrev-ref HEAD');
        } catch {
            return 'unknown';
        }
    }

    /**
     * Get current git commit hash
     */
    private async getCurrentCommit(): Promise<string> {
        try {
            return await this.execGit('rev-parse HEAD');
        } catch {
            return 'unknown';
        }
    }

    /**
     * Log to output channel
     */
    private log(message: string): void {
        const timestamp = new Date().toISOString();
        this.outputChannel.appendLine(`[${timestamp}] ${message}`);
    }

    /**
     * Get list of snapshots
     */
    getSnapshots(): DevModeSnapshot[] {
        return [...this.snapshots];
    }

    /**
     * Get all available branches (local and remote)
     */
    async getAllBranches(): Promise<{ local: string[]; remote: string[]; current: string }> {
        try {
            // Get current branch
            const current = await this.getCurrentBranch();

            // Get local branches
            const localOutput = await this.execGit('branch --format="%(refname:short)"');
            const local = localOutput.split('\n').filter(b => b.trim());

            // Get remote branches
            const remoteOutput = await this.execGit('branch -r --format="%(refname:short)"');
            const remote = remoteOutput
                .split('\n')
                .filter(b => b.trim() && !b.includes('HEAD'))
                .map(b => b.replace('origin/', '').trim());

            // Combine and deduplicate
            const allBranches = [...new Set([...local, ...remote])];

            return {
                local,
                remote,
                current
            };
        } catch (error) {
            this.log(`Failed to get branches: ${error}`);
            return { local: ['main'], remote: [], current: 'main' };
        }
    }

    /**
     * Push changes to any branch
     */
    async pushToBranch(targetBranch: string, commitMessage: string, createIfNotExists: boolean = false): Promise<void> {
        this.log(`🚀 Pushing changes to ${targetBranch} branch...`);

        try {
            // Get current branch
            const currentBranch = await this.getCurrentBranch();

            // Stage all changes
            await this.execGit('add .');

            // Commit changes if there are any
            try {
                await this.execGit(`commit -m "${commitMessage.replace(/"/g, '\\"')}"`);
            } catch (error) {
                // Might be no changes to commit
                this.log(`Commit note: ${error}`);
            }

            // Check if target branch exists
            const branches = await this.getAllBranches();
            const branchExists = branches.local.includes(targetBranch) || branches.remote.includes(targetBranch);

            if (!branchExists && !createIfNotExists) {
                throw new Error(`Branch '${targetBranch}' does not exist. Use "Create New Branch" to create it.`);
            }

            if (currentBranch === targetBranch) {
                // Already on target branch, just push
                await this.execGit(`push origin ${targetBranch}`);
            } else {
                // Checkout target branch (create if needed)
                if (branchExists) {
                    await this.execGit(`checkout ${targetBranch}`);
                } else {
                    await this.execGit(`checkout -b ${targetBranch}`);
                }

                // If we had commits on the original branch, merge them
                if (currentBranch) {
                    try {
                        await this.execGit(`merge ${currentBranch} --no-edit`);
                    } catch (error) {
                        this.log(`Merge note: ${error}`);
                    }
                }

                // Push to remote
                await this.execGit(`push -u origin ${targetBranch}`);

                // Stay on the new branch (don't switch back)
            }

            this.log(`✅ Successfully pushed to ${targetBranch}!`);
            vscode.window.showInformationMessage(`✅ Changes pushed to ${targetBranch} branch!`);
        } catch (error) {
            this.log(`❌ Failed to push to ${targetBranch}: ${error}`);
            vscode.window.showErrorMessage(`Failed to push to ${targetBranch}: ${error}`);
            throw error;
        }
    }

    /**
     * Push changes to main branch (convenience wrapper)
     */
    async pushToMain(commitMessage: string): Promise<void> {
        await this.pushToBranch('main', commitMessage, false);
    }

    /**
     * Create and push to a new branch
     */
    async pushToNewBranch(branchName: string, commitMessage: string): Promise<void> {
        await this.pushToBranch(branchName, commitMessage, true);
    }

	/**
	 * Configure MCP server for extension source access
	 */
	private async configureMCPServer(): Promise<void> {
		this.log('Configuring MCP server for extension source access...');

		try {
			const homeDir = require('os').homedir();
			// Use the same path that MCPHandler reads from
			const mcpConfigPath = path.join(homeDir, '.claude', 'mcp', 'mcp-servers.json');
			const serverPath = path.join(this.extensionPath, 'mcp-server-extension-source.js');

			// Read existing MCP config
			let mcpConfig: any = { mcpServers: {} };
			if (fs.existsSync(mcpConfigPath)) {
				const configData = fs.readFileSync(mcpConfigPath, 'utf8');
				mcpConfig = JSON.parse(configData);
			}

			// Ensure mcpServers object exists
			if (!mcpConfig.mcpServers) {
				mcpConfig.mcpServers = {};
			}

			// Add extension source server if not already present
			if (!mcpConfig.mcpServers['extension-source']) {
				mcpConfig.mcpServers['extension-source'] = {
					command: 'node',
					args: [serverPath],
					description: 'Access to extension source code for self-modification'
				};

				// Save config
				fs.mkdirSync(path.dirname(mcpConfigPath), { recursive: true });
				fs.writeFileSync(mcpConfigPath, JSON.stringify(mcpConfig, null, 2));

				this.log('✅ MCP server configured: extension-source');
				vscode.window.showInformationMessage(
					'🔌 MCP server "extension-source" configured. Tools: get_extension_source, Read, Write, Edit',
					'OK'
				);
			} else {
				this.log('MCP server already configured');
			}
		} catch (error) {
			this.log(`Warning: Could not configure MCP server: ${error}`);
			vscode.window.showWarningMessage(
				`Could not auto-configure MCP server: ${error}. You may need to configure it manually.`
			);
		}
	}

	/**
	 * Remove MCP server configuration
	 */
	private async removeMCPServer(): Promise<void> {
		try {
			const homeDir = require('os').homedir();
			// Use the same path that MCPHandler reads from
			const mcpConfigPath = path.join(homeDir, '.claude', 'mcp', 'mcp-servers.json');

			if (fs.existsSync(mcpConfigPath)) {
				const configData = fs.readFileSync(mcpConfigPath, 'utf8');
				const mcpConfig = JSON.parse(configData);

				if (mcpConfig.mcpServers && mcpConfig.mcpServers['extension-source']) {
					delete mcpConfig.mcpServers['extension-source'];
					fs.writeFileSync(mcpConfigPath, JSON.stringify(mcpConfig, null, 2));
					this.log('✅ Removed MCP server configuration');
				}
			}
		} catch (error) {
			this.log(`Warning: Could not remove MCP server: ${error}`);
		}
	}


    /**
     * Dispose resources
     */
    dispose(): void {
        // Clean up MCP server if dev mode was active
        if (this.isDevModeActive) {
            this.removeMCPServer();
        }
        this.stopSourceWatcher();
        if (this.compileTimeout) {
            clearTimeout(this.compileTimeout);
        }
        this.outputChannel.dispose();
    }
}
