# Claude Custom Chat Extension - Development Guide

This is a VSCode extension that provides a chat interface for Claude Code CLI.

## Platform Support

**Tested on:**
- macOS (ARM64 and Intel)
- Linux (Ubuntu, Debian, Fedora)
- Windows 10/11 (via PowerShell)

**Installation:**
- macOS/Linux: Run `./install-dev.sh`
- Windows: Run `.\install-dev.ps1` (as Administrator)

## Dev Mode Workflow

When working on this extension:

1. **Install**: Run the installation script for your platform (see above)
2. **Enable Dev Mode**: Activate dev mode in the extension (this exposes source code via MCP)
3. **Explore**: Start by calling the `get_extension_source` MCP tool to understand the codebase structure
4. **Modify**: Edit source code using the MCP tools (`Read`, `Write`, `Edit`)
5. **Compile**: Changes trigger auto-compilation (or run `npm run compile` manually)
6. **Test**: Run `npm test` to verify changes
7. **Reload**: Reload the IDE window to apply changes
8. **Rollback**: Use rollback commands if needed to undo changes
9. **Push**: Commit and push to branch when ready

### Important: Starting Point for Code Exploration

**When dev mode is activated, ANY exploration of the codebase MUST start with the MCP `get_extension_source` tool.** This is the primary entry point that provides:
- Complete file structure overview
- Content of key files (extension.ts, ui.ts, package.json)
- Understanding of the extension architecture

Only after calling `get_extension_source` should you use the `Read` tool to examine specific files in detail.

## Key Directories

- `src/` - TypeScript source files
- `src/managers/` - Core managers (DevModeManager, ConversationManager, etc.)
- `src/handlers/` - Message handlers and stream parsing
- `src/webview/` - Frontend JavaScript for the chat UI
- `out/` - Compiled JavaScript output

## Common Tasks

### Making UI Changes
Edit files in `src/webview/` (JavaScript) or `src/ui.ts` (HTML template)

### Adding Features
1. Add backend logic in `src/handlers/` or `src/managers/`
2. Add message handling in `src/extension.ts`
3. Add frontend in `src/webview/`

### Testing
```bash
npm test          # Run all tests
npm run compile   # Compile TypeScript
```

## Current Extension Path
The extension is symlinked from the IDE extensions folder to this repo, so all changes here are reflected in the installed extension after compilation and reload.
