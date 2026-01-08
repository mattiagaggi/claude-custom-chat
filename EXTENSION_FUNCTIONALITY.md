# Claude Code Chat Extension - Core Functionality

## What This Extension Does

This VS Code extension provides a chat interface for Claude Code (Anthropic's CLI tool).

### Core Features

1. **Chat Interface**
   - Webview-based chat UI in VS Code
   - Can open as sidebar or panel
   - Sends messages to Claude Code CLI
   - Displays responses with markdown formatting

2. **Claude Process Management**
   - Spawns `claude` CLI process
   - Supports native execution and WSL
   - Handles stdin/stdout communication
   - Parses stream-json output format

3. **Session Management**
   - Start new sessions
   - Resume previous sessions
   - Save conversation history to disk
   - Load past conversations

4. **Permission Handling**
   - Claude requests permissions for tool use (Bash, Edit, Write, etc.)
   - Shows permission prompts in UI
   - User approves/denies
   - Sends response back via stdin
   - Supports "always allow" permissions

5. **Features**
   - Plan First mode (--permission-mode plan)
   - Thinking Mode (--thinking with intensity levels)
   - Model selection
   - MCP server configuration
   - Custom prompt snippets
   - Usage statistics display
   - Image attachment support

### Architecture

**Current (2,900 lines)**:
- One large ClaudeChatProvider class handles everything
- Mixes concerns: UI, process management, parsing, permissions
- Difficult to maintain and test

**Target (should be ~500-800 lines)**:
- Thin coordinator that delegates to specialized classes
- Managers handle: process, conversation, permissions
- Handlers handle: messages, stream parsing
- Clean separation of concerns

### Key Operations

1. **Send Message Flow**
   - User types message → webview posts message
   - Extension spawns claude process with args
   - Writes JSON message to stdin
   - Reads stdout line by line (stream-json)
   - Parses and routes to UI

2. **Permission Flow**
   - Claude sends control_request on stdout
   - Extension shows UI prompt
   - User approves/denies
   - Extension sends control_response on stdin
   - Claude continues execution

3. **Session Flow**
   - Start: spawn new claude process
   - Resume: spawn with --resume flag + session ID
   - Save: write messages to ~/.claude/conversations/
   - Load: read from disk, restore UI state

## Rewrite Strategy

### Keep
- WebviewMessageHandler (225 lines) ✓
- StreamParser (139 lines) ✓
- ProcessManager (165 lines) ✓
- ConversationManager (248 lines) ✓
- PermissionManager (187 lines) ✓

### Rewrite from Scratch
- **extension.ts** - reduce to ~500-800 lines
  - Simple coordinator
  - Delegates to managers
  - Minimal state
  - Clean methods

### Total Target
- Coordinator: 500-800 lines
- Managers: 607 lines
- Handlers: 370 lines
- **Total: ~1,500-1,800 lines** (vs current 2,900)
