/**
 * GraphBackendManager.ts - Graph Backend Process Lifecycle
 *
 * Manages the Python graph backend process:
 * - Starting/stopping the Uvicorn server
 * - Health checks
 * - Configuration from VS Code settings
 */

import * as path from 'path';
import * as http from 'http';
import { ChildProcess, spawn } from 'child_process';
import * as vscode from 'vscode';

let graphBackendProcess: ChildProcess | null = null;

export function getGraphBackendConfig() {
	const config = vscode.workspace.getConfiguration('claudeCodeChat.graphBackend');
	const backendDir = config.get<string>('path', '');
	const port = config.get<number>('port', 8000);
	let pythonPath = config.get<string>('pythonPath', '');
	if (!pythonPath && backendDir) {
		pythonPath = path.join(backendDir, '.venv', 'bin', 'python');
	}
	return { backendDir, pythonPath, port };
}

export function isGraphBackendRunning(): Promise<boolean> {
	const { port } = getGraphBackendConfig();
	return new Promise((resolve) => {
		const req = http.get(`http://localhost:${port}/api/health`, { timeout: 2000 }, (res) => {
			resolve(res.statusCode === 200);
		});
		req.on('error', () => resolve(false));
		req.on('timeout', () => { req.destroy(); resolve(false); });
	});
}

export async function startGraphBackend(): Promise<void> {
	const { backendDir, pythonPath, port } = getGraphBackendConfig();
	if (!backendDir) {
		console.log('[GraphBackend] No backend path configured, skipping auto-start');
		return;
	}
	stopGraphBackend();
	if (await isGraphBackendRunning()) {
		console.log('[GraphBackend] Already running on port', port);
		return;
	}
	try {
		graphBackendProcess = spawn(pythonPath, ['-m', 'uvicorn', 'app.main:app', '--host', '0.0.0.0', '--port', String(port)], {
			cwd: backendDir,
			stdio: 'ignore',
			detached: false,
		});
		graphBackendProcess.on('error', (err) => {
			console.error('[GraphBackend] Failed to start:', err.message);
			graphBackendProcess = null;
		});
		graphBackendProcess.on('exit', (code) => {
			console.log(`[GraphBackend] Exited with code ${code}`);
			graphBackendProcess = null;
		});
		console.log('[GraphBackend] Started (pid:', graphBackendProcess.pid, ')');
	} catch (err: any) {
		console.error('[GraphBackend] Error starting:', err.message);
	}
}

export function stopGraphBackend(): void {
	if (graphBackendProcess) {
		graphBackendProcess.kill();
		graphBackendProcess = null;
		console.log('[GraphBackend] Stopped');
	}
}

export function fetchLogicGraphContext(workspacePath: string): Promise<string | null> {
	const { port } = getGraphBackendConfig();
	const url = `http://localhost:${port}/api/graph/context?workspacePath=${encodeURIComponent(workspacePath)}`;
	return new Promise((resolve) => {
		const req = http.get(url, { timeout: 5000 }, (res) => {
			if (res.statusCode !== 200) {
				resolve(null);
				return;
			}
			let data = '';
			res.on('data', (chunk: string) => { data += chunk; });
			res.on('end', () => {
				try {
					const parsed = JSON.parse(data);
					resolve(parsed.context || null);
				} catch {
					resolve(null);
				}
			});
		});
		req.on('error', () => resolve(null));
		req.on('timeout', () => { req.destroy(); resolve(null); });
	});
}

export function buildContextFromCachedGraph(context: vscode.ExtensionContext): string | null {
	const saved = context.workspaceState.get<any>('claude.graphData');
	if (!saved?.graph?.nodes?.length) return null;
	const lines: string[] = [];
	for (const node of saved.graph.nodes) {
		const d = node.data;
		if (!d) continue;
		lines.push(`## ${d.label}`);
		if (d.description) lines.push(d.description);
		if (d.files?.length) lines.push(`Files: ${d.files.join(', ')}`);
		if (d.subNodes?.length) {
			for (const sub of d.subNodes) {
				lines.push(`  - ${sub.label}${sub.description ? ': ' + sub.description : ''}`);
				if (sub.files?.length) lines.push(`    Files: ${sub.files.join(', ')}`);
			}
		}
		lines.push('');
	}
	const nodeMap = new Map<string, string>();
	for (const node of saved.graph.nodes) {
		if (node.data?.id && node.data?.label) {
			nodeMap.set(node.data.id, node.data.label);
		}
	}
	if (saved.graph.edges?.length) {
		lines.push('## Relationships');
		for (const edge of saved.graph.edges) {
			const e = edge.data;
			if (!e) continue;
			const src = nodeMap.get(e.source) || e.source;
			const tgt = nodeMap.get(e.target) || e.target;
			lines.push(`- ${src} → ${tgt}${e.label ? ' (' + e.label + ')' : ''}`);
		}
	}
	return lines.join('\n');
}
