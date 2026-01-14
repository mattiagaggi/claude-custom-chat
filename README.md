# 🚀 Claude Custom Chat - Beautiful Chat Interface for Claude Code

[![VS Code Extension](https://img.shields.io/badge/VS%20Code-Extension-blue?style=for-the-badge&logo=visual-studio-code)](https://marketplace.visualstudio.com/items?itemName=andrepimenta.claude-custom-chat)
[![Cursor Compatible](https://img.shields.io/badge/Cursor-Compatible-brightgreen?style=for-the-badge)](https://cursor.sh)
[![Claude Code](https://img.shields.io/badge/Powered%20by-Claude%20Code-orange?style=for-the-badge)](https://claude.ai/code)
[![TypeScript](https://img.shields.io/badge/Built%20with-TypeScript-3178C6?style=for-the-badge&logo=typescript)](https://www.typescriptlang.org/)

> **No more terminal commands. Chat with Claude Code through a beautiful, intuitive interface right inside VS Code or Cursor.**

Ditch the command line and experience Claude Code like never before. This extension brings a stunning chat interface directly into your editor, making AI assistance accessible, visual, and enjoyable.

🤖 **Built by Claude Code for Claude Code** - This extension was entirely developed using Claude Code itself. Claude Code created its own chat interface!

![Claude Custom Chat](https://github.com/user-attachments/assets/5954a74c-eff7-4205-8482-6a1c9de6e102)

---

## 🚀 **Quick Start - Get Up and Running in 3 Steps**

### 1. Install Claude Code CLI

First, install the Claude Code CLI from Anthropic:
- Visit [claude.ai/code](https://claude.ai/code) and follow the installation instructions
- Or run: `npm install -g @anthropic/claude`
- You'll need an active Claude API key or Pro/Max subscription

### 2. Fork  This Repository

```bash
# Fork the repository on GitHub, then clone your fork
git clone https://github.com/YOUR_USERNAME/claude-custom-chat
cd claude-custom-chat
```

### 3. Run the Installation Script

```bash
./install-dev.sh
```

The installation script will:
- Automatically detect your editor (VS Code, Cursor, or other forks)
- Install all npm dependencies
- Compile TypeScript to JavaScript
- Create a symlink in your editor's extensions directory
- Set up the development environment

**That's it!** Reload your editor (`Cmd/Ctrl + R`) and press `Ctrl+Shift+C` (or `Cmd+Shift+C` on Mac) to open Claude Custom Chat.

---

## 🛠️ **Making Changes with Dev Mode**

Want to customize or improve the extension? **Dev Mode** lets you modify the extension from within itself using Claude Code!

### How It Works

1. **Enable Dev Mode** - Click the 🛠️ button in the chat header
2. **Ask Claude to Make Changes** - Just describe what you want:
   ```
   "Add a dark theme toggle button"
   "Change the chat bubble colors"
   "Add a keyboard shortcut for quick file search"
   ```
3. **Claude Modifies the Code** - The extension's own source code gets updated
4. **Auto-Compile & Reload** - Changes compile automatically, you choose when to reload
5. **Changes Take Effect** - Your customizations are live!

### Dev Mode Features

- **Automatic File Watching** - Detects code changes instantly
- **Safe Snapshots** - Creates backups before any modifications (persisted to disk)
- **Canary Branches** - Isolates changes in `dev-mode-canary-{timestamp}` branches
- **Rollback Support** - Restore to previous state even after window reload
- **Git Integration** - Built-in push to branch functionality

### Rollback Workflow

If you don't like the changes after reloading:

1. **Open Command Palette** - Press `Cmd+Shift+P` (Mac) or `Ctrl+Shift+P` (Windows/Linux)
2. **Run Rollback** - Type "Claude Code: Dev Mode Rollback" and select it
3. **Confirm** - Click "Rollback" in the confirmation dialog
4. **Reload** - Click "Reload Now" to apply the restored code

Snapshots are saved to disk, so rollback works even after window reload when dev mode is no longer active.

### Example Dev Mode Session

```
You: Enable Dev Mode
Claude: ✅ Dev Mode enabled! I can now modify my own source code.

You: Add a button to export conversations as PDF
Claude: I'll add a PDF export button to the header. Let me modify the necessary files...
[Modifies src/ui.ts, src/handlers/WebviewMessageHandler.ts, and other files]
[Compiles automatically]

Extension: 🔄 Changes compiled! Reload to apply?
You: [Click "Reload Now"]

Extension: ✅ PDF export button is now in the header!
```

---

## ✨ **Key Features**

### 💬 **Beautiful Chat Interface**
- No terminal required - everything through the UI
- Real-time streaming responses with typing indicators
- One-click message copying with visual feedback
- Enhanced markdown support with syntax highlighting
- Auto-resizing input that grows with your content

### ⏪ **Checkpoint & Session Management**
- **Restore Checkpoints** - Instantly undo changes and restore to any previous state
- Automatic Git-based backup system for safe experimentation
- Browse and restore from any conversation checkpoint
- Real-time cost and token tracking
- Session statistics and performance metrics

### 📝 **Inline Diff Viewer**
- **Full Diff Display** - See complete file changes directly in messages
- **Open in Editor Diff** - One-click button to open native side-by-side diff
- **Smart Truncation** - Long diffs are truncated with an expand button
- **Syntax Highlighting** - Proper code highlighting in diff views
- **Visual Change Indicators** - Clear green/red highlighting for changes

### 🔌 **MCP Server Management**
- **Popular Servers Gallery** - One-click installation of common MCP servers
- **Custom Server Creation** - Build and configure your own MCP servers
- **Server Management** - Edit, delete, enable/disable servers through UI
- **Automatic Integration** - Seamless permissions and tool integration

### 🔒 **Advanced Permissions System**
- **Interactive Permission Dialogs** - Detailed tool information with previews
- **Always Allow Functionality** - Smart command pattern matching
- **YOLO Mode** - Skip all permission checks for power users
- **Workspace Permissions** - Granular control over tool execution

### 🖼️ **Image & Clipboard Support**
- **Drag & Drop Images** - Simply drag images directly into the chat
- **Clipboard Paste** - Press Ctrl+V to paste screenshots
- **Multiple Image Selection** - Choose multiple images through file picker
- **Organized Storage** - Auto-organized in `.claude/claude-custom-chat-images/`

### 📁 **Smart File Integration**
- Type `@` to instantly search and reference workspace files
- Click the `@` button next to the input for quick file mentions
- Lightning-fast file search across your entire project
- Seamless context preservation for multi-file discussions

### 🤖 **Model Selection**
- **Opus** - Most capable model for complex tasks
- **Sonnet** - Balanced model for most use cases
- **Default** - Uses your configured model setting
- Easy switching via dropdown selector

### ⚡ **Slash Commands Integration**
- Type `/` or click the `/` button to access all commands
- 23+ Built-in Commands (/agents, /cost, /config, /memory, /review, etc.)
- Custom Command Support
- Terminal Integration with WSL support

### 🧠 **Advanced AI Modes**
- **Plan First Mode** - Make Claude plan before implementing
- **Thinking Mode** - Configurable intensity levels
- **Mode Toggles** - Simple switches above the input

---

## ⚙️ **Configuration**

### Keyboard Shortcuts
| Shortcut | Action |
|----------|--------|
| `Ctrl+Shift+C` | Open Claude Custom Chat |
| `Enter` | Send message |
| `@` | Open file picker |
| `/` | Open slash commands modal |

### WSL Configuration (Windows Users)

If you're using Claude Code through WSL:

1. Open Settings (`Ctrl+,` or `Cmd+,`)
2. Search for "Claude Custom Chat"
3. Configure:
   - **WSL Enabled** - Enable WSL integration
   - **WSL Distro** - Your distribution (e.g., `Ubuntu`)
   - **WSL Node Path** - Path to Node.js in WSL (default: `/usr/bin/node`)
   - **WSL Claude Path** - Path to Claude in WSL (default: `/usr/local/bin/claude`)

Example `settings.json`:
```json
{
  "claudeCodeChat.wsl.enabled": true,
  "claudeCodeChat.wsl.distro": "Ubuntu",
  "claudeCodeChat.wsl.nodePath": "/usr/bin/node",
  "claudeCodeChat.wsl.claudePath": "/usr/local/bin/claude"
}
```

---

## 💡 **Usage Examples**

### 🔥 **Code Review & Refactoring**
```
You: @src/components/UserProfile.tsx Can you review this component?

Claude: I'll analyze your UserProfile component:

1. **Performance**: Add React.memo() to prevent unnecessary re-renders
2. **TypeScript**: The props interface could be more specific
3. **Accessibility**: Missing ARIA labels for screen readers

[Detailed analysis follows...]
```

### 📊 **Project Analysis**
```
You: Analyze my project architecture and identify potential issues

Claude: I'll examine your project structure:

🏗️ **Architecture Overview**
- React frontend with TypeScript
- Node.js backend with Express
- MongoDB database layer

⚠️ **Identified Issues**
- Missing error boundaries in React components
- Database queries lack proper indexing
- API routes missing input validation

[Detailed recommendations...]
```

### ⏪ **Safe Experimentation**
```
You: Refactor this component to use hooks instead of classes

Claude: I'll refactor to hooks. Creating a checkpoint first for safety...

[Creates automatic checkpoint]

Here's the refactored component:
[Shows implementation]

To revert, just click "Restore Checkpoint" - it's instant!
```

---

## 🛠️ **Advanced Development**

### Development Commands

```bash
# Install dependencies
npm install

# Compile TypeScript
npm run compile

# Watch mode (auto-compile on changes)
npm run watch

# Run tests
npm test

# Lint code
npm run lint
```

### Debugging

#### Launch in Debug Mode

1. Open the project in VS Code/Cursor
2. Press `F5` or go to Run and Debug
3. Select "Run Extension"
4. A new window opens with the extension loaded

#### View Logs

- **Dev Mode Output**: View → Output → "Dev Mode"
- **Extension Host**: Help → Toggle Developer Tools
- **Console**: Webview console in Developer Tools

### Project Structure

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
│       ├── permissions.js        # Permission dialogs
│       ├── git-push.js           # Git push UI
│       └── styles.css            # All styles
├── test/                         # Test files
├── install-dev.sh                # Installation script
└── package.json                  # Extension manifest
```

### Architecture Overview

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

---

## 🎯 **Pro Tips & Tricks**

### 🔥 **File Context Magic**
- Type `@` or click the `@` button to reference files
- Use `@src/` to narrow down to specific directories
- Reference multiple files in one message
- Copy-paste images directly into chat
- Paste screenshots with Ctrl+V

### ⚡ **Productivity Boosters**
- Checkpoints created automatically before changes
- Restore instantly if changes don't work out
- Use YOLO mode for speed (skip permissions)
- Stop button cancels long-running operations
- Copy message contents to reuse responses

### 🛠️ **Dev Mode Best Practices**
- Start with small changes before larger refactors
- Review changes with `git diff` before reloading
- Keep changes in canary branch until tested
- One feature at a time for focused development
- **Rollback after reload**: Use `Cmd+Shift+P` → "Claude Code: Dev Mode Rollback" if you don't like changes

### 🔒 **Git Workflow**
After making changes in Dev Mode:
```bash
# Review what changed
git diff main

# Push to your branch
# (or use the 🚀 Push button in the extension)

# Create a PR when ready
gh pr create --base main --head your-branch-name
```

---

## 🤝 **Contributing**

We welcome contributions! Here's how:

1. **Fork the repository** on GitHub
2. **Clone your fork** and run `./install-dev.sh`
3. **Enable Dev Mode** in the extension (🛠️ button)
4. **Make changes** - Use Claude to help modify the code!
5. **Test thoroughly** - Try your changes in different scenarios
6. **Push to your branch** - Use the 🚀 Push button or git commands
7. **Create a Pull Request** - Submit your changes for review

### What Makes a Good Contribution?

- 🐛 **Bug Fixes** - Fix issues reported in GitHub Issues
- ✨ **Features** - Add new functionality that enhances the extension
- 📚 **Documentation** - Improve README, add examples, clarify setup
- 🎨 **UI/UX** - Enhance the interface, improve accessibility
- ⚡ **Performance** - Optimize code, reduce resource usage

---

## 📝 **License**

See the [LICENSE](LICENSE) file for details.

---

## 🙏 **Acknowledgments**

- **Anthropic** - For creating Claude AI and Claude Code SDK
- **VS Code & Cursor Teams** - For the incredible extension platforms
- **Our Community** - For feedback, suggestions, and contributions

---

## 📞 **Support**

Need help? We've got you covered:

- 🐛 **Issues**: [GitHub Issues](https://github.com/andrepimenta/claude-custom-chat/issues)

---

<div align="center">

**⭐ Star us on GitHub if this project helped you!**

[**Download Now**](https://marketplace.visualstudio.com/items?itemName=andrepimenta.claude-custom-chat)

</div>
