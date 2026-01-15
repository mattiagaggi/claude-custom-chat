#!/usr/bin/env node
/**
 * MCP Server for Extension Source Code Access
 *
 * Provides a tool that Claude can call to get the extension's source code
 * when Dev Mode is active. This allows Claude to modify the extension on-demand
 * without injecting source code into every message.
 */

const fs = require('fs');
const path = require('path');

// MCP Protocol implementation
class MCPServer {
    constructor() {
        this.extensionPath = __dirname;
        this.tools = [
            {
                name: 'get_extension_source',
                description: 'IMPORTANT: This is the STARTING POINT for all extension source code exploration when dev mode is active. ALWAYS call this tool FIRST before reading or modifying any files. Returns: (1) Complete file structure overview, (2) Contents of key files (extension.ts, ui.ts, package.json), (3) List of all available source files. After calling this, use the Read tool to examine specific files in detail.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        include_webview: {
                            type: 'boolean',
                            description: 'Whether to include webview JavaScript files in the file list (default: false)',
                            default: false
                        }
                    }
                }
            },
            {
                name: 'Read',
                description: 'Read a file from the extension source code. File paths should be relative to the extension root (e.g., "src/extension.ts", "src/managers/DevModeManager.ts"). Only works within the extension directory.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        file_path: {
                            type: 'string',
                            description: 'Relative path to the file within the extension directory (e.g., "src/extension.ts")'
                        }
                    },
                    required: ['file_path']
                }
            },
            {
                name: 'Write',
                description: 'Write or overwrite a file in the extension source code. File paths should be relative to the extension root. Only works within the extension directory. The extension will auto-compile after changes.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        file_path: {
                            type: 'string',
                            description: 'Relative path to the file within the extension directory (e.g., "src/extension.ts")'
                        },
                        content: {
                            type: 'string',
                            description: 'Complete file content to write'
                        }
                    },
                    required: ['file_path', 'content']
                }
            },
            {
                name: 'Edit',
                description: 'Edit a file in the extension source code by replacing exact string matches. File paths should be relative to the extension root. Only works within the extension directory.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        file_path: {
                            type: 'string',
                            description: 'Relative path to the file within the extension directory'
                        },
                        old_string: {
                            type: 'string',
                            description: 'Exact string to find and replace (must be unique in the file)'
                        },
                        new_string: {
                            type: 'string',
                            description: 'String to replace it with'
                        }
                    },
                    required: ['file_path', 'old_string', 'new_string']
                }
            }
        ];
    }

    async initialize() {
        return {
            protocolVersion: '2024-11-05',
            capabilities: {
                tools: {}
            },
            serverInfo: {
                name: 'extension-source',
                version: '1.0.0'
            }
        };
    }

    async listTools() {
        return { tools: this.tools };
    }

    async callTool(name, args) {
        switch (name) {
            case 'get_extension_source':
                return await this.getExtensionSource(args);
            case 'Read':
                return await this.readFile(args);
            case 'Write':
                return await this.writeFile(args);
            case 'Edit':
                return await this.editFile(args);
            default:
                throw new Error(`Unknown tool: ${name}`);
        }
    }

    async getExtensionSource(args = {}) {
        const includeWebview = args.include_webview || false;

        let context = '# Extension Source Code\n\n';
        context += `## IMPORTANT: To modify files, use the paths below directly.\n`;
        context += `Extension Path: ${this.extensionPath}\n\n`;

        // Get all source files
        const srcPath = path.join(this.extensionPath, 'src');
        const files = this.getAllSourceFiles(srcPath, includeWebview);

        context += '## File Structure:\n';
        for (const file of files) {
            const relativePath = path.relative(this.extensionPath, file);
            context += `- ${relativePath}\n`;
        }

        context += '\n## Key Files:\n\n';

        // Include important files in full
        const keyFiles = [
            'CLAUDE.md',      // Development instructions for Claude
            'src/extension.ts',
            'src/ui.ts',
            'package.json'
        ];

        for (const keyFile of keyFiles) {
            const filePath = path.join(this.extensionPath, keyFile);
            if (fs.existsSync(filePath)) {
                const content = fs.readFileSync(filePath, 'utf8');
                const ext = path.extname(keyFile).slice(1);
                context += `### ${keyFile}\n\`\`\`${ext}\n${content}\n\`\`\`\n\n`;
            }
        }

        return {
            content: [{
                type: 'text',
                text: context
            }]
        };
    }

    getAllSourceFiles(dir, includeWebview) {
        const files = [];
        const items = fs.readdirSync(dir, { withFileTypes: true });

        for (const item of items) {
            const fullPath = path.join(dir, item.name);

            // Skip webview files if not requested
            if (!includeWebview && fullPath.includes('/webview/')) {
                continue;
            }

            if (item.isDirectory()) {
                files.push(...this.getAllSourceFiles(fullPath, includeWebview));
            } else if (item.isFile() && /\.(ts|js|json)$/.test(item.name)) {
                files.push(fullPath);
            }
        }

        return files;
    }

    /**
     * Validate that a path is within the extension directory (security check)
     */
    validatePath(relativePath) {
        const fullPath = path.resolve(this.extensionPath, relativePath);
        const normalized = path.normalize(fullPath);

        if (!normalized.startsWith(this.extensionPath)) {
            throw new Error('Access denied: Path must be within extension directory');
        }

        return normalized;
    }

    /**
     * Read a file from the extension directory
     */
    async readFile(args) {
        if (!args.file_path) {
            throw new Error('file_path parameter is required');
        }

        const fullPath = this.validatePath(args.file_path);

        if (!fs.existsSync(fullPath)) {
            throw new Error(`File not found: ${args.file_path}`);
        }

        const content = fs.readFileSync(fullPath, 'utf8');
        const ext = path.extname(args.file_path).slice(1);

        return {
            content: [{
                type: 'text',
                text: `# ${args.file_path}\n\`\`\`${ext}\n${content}\n\`\`\``
            }]
        };
    }

    /**
     * Write a file to the extension directory
     */
    async writeFile(args) {
        if (!args.file_path) {
            throw new Error('file_path parameter is required');
        }
        if (args.content === undefined) {
            throw new Error('content parameter is required');
        }

        const fullPath = this.validatePath(args.file_path);

        // Ensure directory exists
        const dir = path.dirname(fullPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        fs.writeFileSync(fullPath, args.content, 'utf8');

        return {
            content: [{
                type: 'text',
                text: `Successfully wrote to ${args.file_path}`
            }]
        };
    }

    /**
     * Edit a file by replacing exact string matches
     */
    async editFile(args) {
        if (!args.file_path) {
            throw new Error('file_path parameter is required');
        }
        if (!args.old_string) {
            throw new Error('old_string parameter is required');
        }
        if (args.new_string === undefined) {
            throw new Error('new_string parameter is required');
        }

        const fullPath = this.validatePath(args.file_path);

        if (!fs.existsSync(fullPath)) {
            throw new Error(`File not found: ${args.file_path}`);
        }

        const content = fs.readFileSync(fullPath, 'utf8');

        // Check if old_string exists
        if (!content.includes(args.old_string)) {
            throw new Error('old_string not found in file');
        }

        // Check if old_string is unique
        const occurrences = content.split(args.old_string).length - 1;
        if (occurrences > 1) {
            throw new Error(`old_string appears ${occurrences} times in file. It must be unique.`);
        }

        // Perform replacement
        const newContent = content.replace(args.old_string, args.new_string);
        fs.writeFileSync(fullPath, newContent, 'utf8');

        return {
            content: [{
                type: 'text',
                text: `Successfully edited ${args.file_path}`
            }]
        };
    }

    async handleMessage(message) {
        const { jsonrpc, id, method, params } = message;

        let result;
        try {
            switch (method) {
                case 'initialize':
                    result = await this.initialize();
                    break;
                case 'tools/list':
                    result = await this.listTools();
                    break;
                case 'tools/call':
                    result = await this.callTool(params.name, params.arguments || {});
                    break;
                default:
                    throw new Error(`Unknown method: ${method}`);
            }

            return {
                jsonrpc,
                id,
                result
            };
        } catch (error) {
            return {
                jsonrpc,
                id,
                error: {
                    code: -32603,
                    message: error.message
                }
            };
        }
    }
}

// Start server
const server = new MCPServer();

// Handle stdin messages
let buffer = '';
process.stdin.on('data', async (chunk) => {
    buffer += chunk.toString();

    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
        if (line.trim()) {
            try {
                const message = JSON.parse(line);
                const response = await server.handleMessage(message);
                process.stdout.write(JSON.stringify(response) + '\n');
            } catch (error) {
                console.error('Error processing message:', error);
            }
        }
    }
});

process.stdin.on('end', () => {
    process.exit(0);
});
