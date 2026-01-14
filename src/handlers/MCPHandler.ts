/**
 * MCPHandler.ts - MCP Server Configuration Manager
 *
 * Manages Model Context Protocol (MCP) server configuration.
 * Reads/writes server config from ~/.claude/mcp_servers.json.
 * Provides methods to list, add, update, and remove MCP servers.
 */

import * as path from 'path';

export class MCPHandler {
	constructor() {}

	/**
	 * Get the MCP config file path
	 */
	getConfigPath(): string | undefined {
		const homeDir = require('os').homedir();
		const storagePath = path.join(homeDir, '.claude');
		return path.join(storagePath, 'mcp', 'mcp-servers.json');
	}

	/**
	 * Load MCP servers from config file
	 */
	async loadServers(): Promise<Record<string, any>> {
		const mcpConfigPath = this.getConfigPath();
		if (!mcpConfigPath) {
			return {};
		}

		try {
			const fs = require('fs').promises;
			const data = await fs.readFile(mcpConfigPath, 'utf8');
			const config = JSON.parse(data);
			return config.mcpServers || {};
		} catch (error: any) {
			console.error('Failed to load MCP servers:', error.message);
			return {};
		}
	}

	/**
	 * Save an MCP server configuration
	 */
	async saveServer(name: string, config: any): Promise<boolean> {
		const mcpConfigPath = this.getConfigPath();
		if (!mcpConfigPath) {
			return false;
		}

		try {
			const fs = require('fs').promises;
			let mcpConfig: any = { mcpServers: {} };

			// Load existing config
			try {
				const data = await fs.readFile(mcpConfigPath, 'utf8');
				mcpConfig = JSON.parse(data);
				if (!mcpConfig.mcpServers) {
					mcpConfig.mcpServers = {};
				}
			} catch {
				// File doesn't exist yet - ensure directory exists
				const dir = path.dirname(mcpConfigPath);
				await fs.mkdir(dir, { recursive: true });
			}

			// Add/update server
			mcpConfig.mcpServers[name] = config;

			// Save config
			await fs.writeFile(mcpConfigPath, JSON.stringify(mcpConfig, null, 2));
			return true;
		} catch (error: any) {
			console.error('Failed to save MCP server:', error.message);
			return false;
		}
	}

	/**
	 * Delete an MCP server configuration
	 */
	async deleteServer(name: string): Promise<boolean> {
		const mcpConfigPath = this.getConfigPath();
		if (!mcpConfigPath) {
			return false;
		}

		try {
			const fs = require('fs').promises;
			const data = await fs.readFile(mcpConfigPath, 'utf8');
			const mcpConfig = JSON.parse(data);

			if (mcpConfig.mcpServers && mcpConfig.mcpServers[name]) {
				delete mcpConfig.mcpServers[name];
				await fs.writeFile(mcpConfigPath, JSON.stringify(mcpConfig, null, 2));
				return true;
			}
			return false;
		} catch (error: any) {
			console.error('Failed to delete MCP server:', error.message);
			return false;
		}
	}
}
