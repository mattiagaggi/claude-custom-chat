# Claude Custom Chat

A VS Code/Cursor extension that provides a custom chat interface for the [Claude Code CLI](https://claude.ai/code).

This is the first Claude extension that can modify itself!

Just enter dev mode and the extension will have its own source code available as MCP. Make the change, reload the window and see the change you made. If you don't like it click CMD+Shift+C to rollback to the previous version. The command is "Claude Custom Chat: Dev Mode: Rollback to Latest Snapshot". You can also use "Claude Custom Chat: Dev Mode: Pick and Rollback to Snapshot" to rollback to any previous version.

## Demo

Here's a quick example showing how to ask Claude to modify the UI (removing the @ button):

https://github.com/user-attachments/assets/9b6cdc09-6deb-45e7-a498-db25293704a0

---

This is a fork of the original [claude-code-chat](https://github.com/anthropics/claude-code-chat) repository.

## Platform Support

**Tested on:**
- macOS (ARM64 and Intel)
- Linux (Ubuntu, Debian, Fedora)
- Windows 10/11 (via PowerShell)

**Supported Editors:**
- VS Code
- Cursor
- Other VS Code forks (Antigravity, etc.)

**Requirements:**
- Node.js 16+ and npm
- Git
- Claude Code CLI (`npm install -g @anthropic/claude`)
- Active Claude API key or Pro/Max subscription

## Installation

### 1. Install Claude Code CLI

First, install the Claude Code CLI from Anthropic:
- Visit [claude.ai/code](https://claude.ai/code) and follow the installation instructions
- Or run: `npm install -g @anthropic/claude`
- You'll need an active Claude API key or Pro/Max subscription

Type `claude` in bash and check it works.

### 2. Fork This Repository

```bash
# Fork the repository on GitHub, then clone your fork
git clone https://github.com/YOUR_USERNAME/claude-custom-chat
cd claude-custom-chat
```

### 3. Run the Installation Script

**On macOS/Linux:**
```bash
./install-dev.sh
```

**On Windows:**
```powershell
# Run PowerShell as Administrator (required for symlinks)
.\install-dev.ps1
```

Then you are done!!!

The installation script will:
- Automatically detect your editor (VS Code, Cursor, or other forks)
- Install all npm dependencies
- Compile TypeScript to JavaScript
- Create a symlink in your editor's extensions directory
- Set up the development environment

**Note for Windows users:** The script requires administrator privileges to create symbolic links. If you see an error, right-click PowerShell and select "Run as Administrator".

**That's it!** Reload your editor (`Cmd/Ctrl + R`) and press `Ctrl+Shift+C` (or `Cmd+Shift+C` on Mac) to open Claude Custom Chat.

---

## Checkpoint & Session Management

**Restore Checkpoints** - Instantly undo changes and restore to any previous state. Automatic Git-based backup system for safe experimentation. Browse and restore from any conversation checkpoint with real-time cost and token tracking.

## Graph Visualization

Open the graph view using the 📊 button in the header. The graph tab appears as a closeable tab in the tab bar, just like conversation tabs. It connects to an external backend to visualize codebase relationships using Cytoscape.js.

---

## Dev Mode Guide

### Overview

Dev Mode enables Claude to modify the extension's own source code in a safe, controlled manner. It includes:
- **Persistent Snapshots**: Snapshots are saved to disk, allowing rollback even after window reload
- **Direct Source Access**: When you ask about the extension, Claude automatically sees the source code
- **Auto-compilation**: Changes trigger automatic compilation with reload prompts
- **Tips Bar**: Visual indicators and helpful tips displayed in the chat interface during dev mode

### Workflow

1. Enable dev mode (snapshot created automatically)
2. Ask Claude to modify the extension
3. Changes are compiled and you're prompted to reload
4. Test the changes in the reloaded window
5. Rollback if needed using the commands below

### How It Works

#### Extension Source Access via MCP Tools
When dev mode is active, an MCP server is configured that provides Claude with scoped tools to access and modify the extension:

**Available Tools:**
- `get_extension_source` - Get overview of extension structure and key files
- `Read` - Read any file in the extension (e.g., "src/extension.ts")
- `Write` - Write/create files in the extension
- `Edit` - Edit files by replacing exact string matches

**IMPORTANT: Starting Point for Code Exploration**

When dev mode is activated, **ANY exploration or modification of the extension source code MUST begin with the `get_extension_source` MCP tool**. This is the primary entry point that provides:
- Complete file structure of the extension
- Contents of key files (extension.ts, ui.ts, package.json)
- Overview of the extension architecture
- List of all available files to explore

**Workflow:**
1. When dev mode activates, always call `get_extension_source` first
2. Review the file structure and key files provided
3. Use `Read` tool to examine specific files in detail
4. Use `Write` or `Edit` tools to make changes
5. Changes auto-compile and you're prompted to reload

**How to use:**
- Just ask about the extension naturally (e.g., "where is the rollback code?")
- Claude will automatically call `get_extension_source` first to understand the codebase
- Then use other tools as needed based on the task
- All operations are scoped to the extension directory only

**Security:** All file paths are validated to ensure they're within the extension directory. Claude cannot access files outside the extension.

#### Tips Bar
When dev mode is active, a tips bar appears at the top of the chat interface showing:
- Current dev mode status
- Helpful reminders (e.g., "Ask me to modify the extension!")
- File change notifications
- Compilation status updates

The tips bar provides visual feedback throughout your dev mode session.

#### Snapshot Creation
- When dev mode is enabled, a snapshot is automatically created
- Snapshots are saved to `.devmode-snapshots/` directory (git-ignored)
- Each snapshot contains:
  - Timestamp
  - Git branch name
  - Git commit hash
  - Complete contents of all source files

#### Snapshot Persistence
- Snapshots are saved as JSON files: `snapshot-{timestamp}.json`
- Snapshots persist across window reloads and extension restarts
- Snapshots are automatically loaded when the extension activates

### Available Commands

#### 1. Dev Mode: Rollback to Latest Snapshot
**Command:** `Claude Custom Chat: Dev Mode: Rollback to Latest Snapshot`

Quickly rollback to the most recent snapshot. Shows a confirmation dialog before proceeding.

**Use case:** You made changes, reloaded the window, and immediately want to undo them.

#### 2. Dev Mode: Pick and Rollback to Snapshot
**Command:** `Claude Custom Chat: Dev Mode: Pick and Rollback to Snapshot`

Shows a picker with all available snapshots, displaying:
- Date and time of snapshot
- Git branch and commit hash
- Number of files in snapshot

**Use case:** You want to rollback to a specific earlier snapshot, not just the latest one.

#### 3. Dev Mode: Clear All Snapshots
**Command:** `Claude Custom Chat: Dev Mode: Clear All Snapshots`

Deletes all snapshots from disk and memory. Shows a confirmation dialog.

**Use case:** Clean up old snapshots to save disk space.

### Workflow Example

```
1. Enable dev mode
   → Snapshot automatically created
   → Tips bar appears with instructions

2. Make changes to src/extension.ts
   → Tips bar shows file change notification

3. Auto-compile triggers, click "Reload Now"
   → Window reloads with your changes

4. Test the changes in the reloaded window

5a. If you like the changes:
    → Continue working or disable dev mode

5b. If you don't like the changes:
    → Open command palette (Cmd+Shift+P)
    → Run "Dev Mode: Rollback to Latest Snapshot"
    → Confirm the rollback
    → All files restored to snapshot state
    → Extension recompiled automatically
```

### Safety Features

- **Confirmation dialogs**: All rollback operations require confirmation
- **Git-ignored**: Snapshots directory is excluded from version control
- **Directory validation**: Ensures target directories exist before restoring files
- **Compilation**: Automatic recompilation after rollback to verify changes
- **Visual feedback**: Tips bar provides real-time status updates

### Technical Details

#### Snapshot Storage Location
`.devmode-snapshots/snapshot-{timestamp}.json`

#### Snapshot Format
```json
{
  "timestamp": 1234567890,
  "branch": "main",
  "commitHash": "abc123...",
  "files": [
    ["src/extension.ts", "file contents..."],
    ["src/managers/DevModeManager.ts", "file contents..."]
  ]
}
```

#### Automatic Loading
Snapshots are automatically loaded when:
- Extension activates
- DevModeManager is instantiated

### Limitations

- Snapshots only include files in the `src/` directory
- No automatic cleanup of old snapshots (must manually clear)
- Snapshots can consume disk space for large extensions

---

## Project Structure

```
claude-custom-chat/
├── src/
│   ├── extension.ts              # Main extension entry point
│   ├── ui.ts                     # Webview HTML generation
│   ├── handlers/                 # Message & stream processing
│   │   ├── StreamParser.ts       # Parses Claude CLI JSON stream
│   │   ├── ConversationHandler.ts # Conversation management
│   │   ├── PermissionRequestHandler.ts # Permission prompts
│   │   └── VSCodeUtilities.ts    # VS Code API wrappers
│   ├── managers/                 # Business logic & state
│   │   ├── ProcessManager.ts     # Claude CLI process lifecycle
│   │   ├── ConversationManager.ts # Conversation persistence
│   │   ├── PermissionManager.ts  # Permission rules
│   │   └── DevModeManager.ts     # Dev Mode & Git functionality
│   ├── types/                    # TypeScript type definitions
│   ├── utils/                    # Utility functions
│   │   ├── PathConverter.ts      # WSL path conversion
│   │   └── ProcessKiller.ts      # Cross-platform process termination
│   └── webview/                  # Frontend (JavaScript/CSS)
│       ├── message-handler.js    # Message routing
│       ├── message-rendering.js  # Chat rendering
│       ├── conversation-tabs.js  # Multi-conversation tab management
│       ├── permissions.js        # Permission dialogs
│       ├── git-push.js           # Git push UI
│       ├── graph/                # Graph visualization modules
│       │   ├── graph-api.js      # Graph backend API communication
│       │   └── graph-ui.js       # Graph UI rendering helpers
│       ├── graph-visualization.js # Graph tab and Cytoscape integration
│       └── styles.css            # All styles
├── test/                         # Test files
├── install-dev.sh                # Installation script
└── package.json                  # Extension manifest
```

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         VS Code/Cursor Extension                 │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                    extension.ts                              ││
│  │         (ClaudeChatProvider - Main Orchestrator)             ││
│  └─────────────────────────────────────────────────────────────┘│
│           │                    │                    │            │
│           ▼                    ▼                    ▼            │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────────┐   │
│  │  Handlers   │     │  Managers   │     │     Webview     │   │
│  │             │     │             │     │                 │   │
│  │ StreamParser│     │ProcessMgr   │     │ message-handler │   │
│  │ Conversation│◄───►│Conversation │◄───►│ state           │   │
│  │ Permission  │     │Permission   │     │ rendering       │   │
│  │             │     │DevModeMgr   │     │ git-push        │   │
│  └─────────────┘     └─────────────┘     └─────────────────┘   │
│           │                    │                                 │
│           ▼                    ▼                                 │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                    Claude CLI Process                        ││
│  │                  (JSON stream via stdin/stdout)              ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

### Key Components

**extension.ts** - Main orchestrator that coordinates all components

**Handlers**:
- StreamParser - Parses JSON stream from Claude CLI
- ConversationHandler - Manages conversation state and history
- PermissionRequestHandler - Handles permission dialogs

**Managers**:
- ProcessManager - Manages Claude CLI process lifecycle
- ConversationManager - Persists conversations to disk
- PermissionManager - Manages permission rules and policies
- DevModeManager - Handles dev mode, snapshots, and rollbacks

**Webview**:
- message-handler.js - Routes messages between UI and extension
- message-rendering.js - Renders chat messages and UI
- permissions.js - Permission dialog interface
- git-push.js - Git integration UI
- styles.css - All styling
