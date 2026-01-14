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
2. **Modify**: Edit source code in `src/` directory
3. **Compile**: Run `npm run compile` to build
4. **Test**: Run `npm test` to verify changes
5. **Reload**: Reload the IDE window to apply changes
6. **Push**: Commit and push to branch when ready

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
