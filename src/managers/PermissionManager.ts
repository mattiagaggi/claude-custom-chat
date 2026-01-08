/**
 * PermissionManager - Handles permission requests and responses
 * Responsibilities:
 * - Tracking pending permission requests
 * - Matching commands against permission patterns
 * - Managing always-allow permissions
 */

import * as vscode from 'vscode';
import * as path from 'path';

export interface PendingPermission {
	requestId: string;
	toolName: string;
	input: Record<string, unknown>;
	suggestions?: any[];
	toolUseId: string;
}

export interface StoredPermission {
	toolName: string;
	pattern: string;
}

export class PermissionManager {
	private _pendingRequests = new Map<string, PendingPermission>();
	private _alwaysAllowPermissions: StoredPermission[] = [];
	private _permissionsPath: string | undefined;

	constructor(private readonly _context: vscode.ExtensionContext) {
		this._initialize();
	}

	/**
	 * Initialize permissions storage
	 */
	private async _initialize(): Promise<void> {
		const homeDir = require('os').homedir();
		const claudeDir = path.join(homeDir, '.claude');

		try {
			const fs = require('fs').promises;
			await fs.mkdir(claudeDir, { recursive: true });
			this._permissionsPath = path.join(claudeDir, 'permissions.json');

			// Load existing permissions
			try {
				const data = await fs.readFile(this._permissionsPath, 'utf8');
				this._alwaysAllowPermissions = JSON.parse(data);
			} catch {
				// File doesn't exist yet, will be created on first save
				this._alwaysAllowPermissions = [];
			}
		} catch (error: any) {
			console.error('Failed to initialize permissions:', error.message);
		}
	}

	/**
	 * Add a pending permission request
	 */
	public addPendingRequest(id: string, request: PendingPermission): void {
		this._pendingRequests.set(id, request);
	}

	/**
	 * Get a pending permission request
	 */
	public getPendingRequest(id: string): PendingPermission | undefined {
		return this._pendingRequests.get(id);
	}

	/**
	 * Remove a pending permission request
	 */
	public removePendingRequest(id: string): void {
		this._pendingRequests.delete(id);
	}

	/**
	 * Cancel all pending requests
	 */
	public cancelAllPending(): void {
		this._pendingRequests.clear();
	}

	/**
	 * Check if a command should be automatically approved
	 */
	public shouldAutoApprove(toolName: string, input: Record<string, unknown>): boolean {
		const command = this._extractCommand(toolName, input);
		if (!command) {
			return false;
		}

		// Check against always-allow permissions
		for (const permission of this._alwaysAllowPermissions) {
			if (permission.toolName === toolName && this._matchesPattern(command, permission.pattern)) {
				return true;
			}
		}

		return false;
	}

	/**
	 * Add an always-allow permission
	 */
	public async addAlwaysAllowPermission(toolName: string, input: Record<string, unknown>): Promise<void> {
		const pattern = this._getCommandPattern(this._extractCommand(toolName, input) || '');

		// Don't add duplicates
		const exists = this._alwaysAllowPermissions.some(
			p => p.toolName === toolName && p.pattern === pattern
		);

		if (!exists) {
			this._alwaysAllowPermissions.push({ toolName, pattern });
			await this._savePermissions();
		}
	}

	/**
	 * Remove an always-allow permission
	 */
	public async removePermission(toolName: string, pattern: string): Promise<void> {
		this._alwaysAllowPermissions = this._alwaysAllowPermissions.filter(
			p => !(p.toolName === toolName && p.pattern === pattern)
		);
		await this._savePermissions();
	}

	/**
	 * Get all always-allow permissions
	 */
	public getAllPermissions(): StoredPermission[] {
		return [...this._alwaysAllowPermissions];
	}

	/**
	 * Save permissions to file
	 */
	private async _savePermissions(): Promise<void> {
		if (!this._permissionsPath) {
			return;
		}

		try {
			const fs = require('fs').promises;
			await fs.writeFile(
				this._permissionsPath,
				JSON.stringify(this._alwaysAllowPermissions, null, 2)
			);
		} catch (error: any) {
			console.error('Failed to save permissions:', error.message);
		}
	}

	/**
	 * Extract command from tool input
	 */
	private _extractCommand(toolName: string, input: Record<string, unknown>): string | null {
		if (toolName === 'Bash' && typeof input.command === 'string') {
			return input.command;
		} else if ((toolName === 'Edit' || toolName === 'Write' || toolName === 'Read') && typeof input.file_path === 'string') {
			return input.file_path;
		}
		return null;
	}

	/**
	 * Get pattern for command
	 */
	private _getCommandPattern(command: string): string {
		// Exact match pattern
		return command;
	}

	/**
	 * Check if command matches pattern
	 */
	private _matchesPattern(command: string, pattern: string): boolean {
		// For now, use exact match
		// Could be extended to support wildcards or regex
		return command === pattern;
	}
}
