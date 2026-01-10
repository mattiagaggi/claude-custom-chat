# 🚀 Claude Code Chat - Beautiful Claude Code Chat Interface for VS Code

[![VS Code Extension](https://img.shields.io/badge/VS%20Code-Extension-blue?style=for-the-badge&logo=visual-studio-code)](https://marketplace.visualstudio.com/items?itemName=andrepimenta.claude-code-chat)
[![Claude Code](https://img.shields.io/badge/Powered%20by-Claude%20Code-orange?style=for-the-badge)](https://claude.ai/code)
[![TypeScript](https://img.shields.io/badge/Built%20with-TypeScript-3178C6?style=for-the-badge&logo=typescript)](https://www.typescriptlang.org/)

> **No more terminal commands. Chat with Claude Code through a beautiful, intuitive interface right inside VS Code.**

Ditch the command line and experience Claude Code like never before. This extension brings a stunning chat interface directly into your editor, making AI assistance accessible, visual, and enjoyable.

🤖 **Built by Claude Code for Claude Code** - This extension was entirely developed using Claude Code itself. Claude Code created its own chat interface!

---

## ✨ **Why Choose Claude Code Chat?**

🖥️ **No Terminal Required** - Beautiful chat interface replaces command-line interactions  
⏪ **Restore Checkpoints** - Undo changes and restore code to any previous state   
🔌 **MCP Server Support** - Complete Model Context Protocol server management   
💾 **Conversation History** - Automatic conversation history and session management  
🎨 **VS Code Native** - Claude Code integrated directly into VS Code with native theming and sidebar support  
🧠 **Plan and Thinking modes** - Plan First and configurable Thinking modes for better results  
⚡ **Smart File/Image Context and Custom Commands** - Reference any file, paste images or screenshots and create custom commands  
🤖 **Model Selection** - Choose between Opus, Sonnet, or Default based on your needs  
🐧 **Windows/WSL Support** - Full native Windows and WSL support

![Claude Code Chat 1 0 0](https://github.com/user-attachments/assets/5954a74c-eff7-4205-8482-6a1c9de6e102)


---

## 🌟 **Key Features**

### 💬 **Beautiful Chat Graphical Interface**
- No terminal required - everything through the UI
- Real-time streaming responses with typing indicators
- One-click message copying with visual feedback
- Enhanced markdown support with syntax highlighting
- Auto-resizing input that grows with your content
- Copy-to-clipboard for code blocks

### ⏪ **Checkpoint & Session Management**
- **Restore Checkpoints** - Instantly undo changes and restore to any previous state
- Automatic Git-based backup system for safe experimentation
- Browse and restore from any conversation checkpoint
- Automatic conversation saving and restoration
- Real-time cost and token tracking
- Session statistics and performance metrics

### 📝 **Inline Diff Viewer** ⭐ **NEW IN V1.1**
- **Full Diff Display** - See complete file changes directly in Edit, MultiEdit, and Write messages
- **Open in VS Code Diff** - One-click button to open VS Code's native side-by-side diff editor
- **Smart Truncation** - Long diffs are truncated with an expand button for better readability
- **Syntax Highlighting** - Proper code highlighting in diff views
- **Visual Change Indicators** - Clear green/red highlighting for additions and deletions

### 🔌 **MCP Server Management** ⭐ **NEW IN V1.0**
- **Popular Servers Gallery** - One-click installation of common MCP servers
- **Custom Server Creation** - Build and configure your own MCP servers
- **Server Management** - Edit, delete, enable/disable servers through UI
- **Automatic Integration** - Seamless permissions and tool integration
- **Cross-platform Support** - Full WSL compatibility with path conversion

### 🔒 **Advanced Permissions System** ⭐ **NEW IN V1.0**
- **Interactive Permission Dialogs** - Detailed tool information with command previews
- **Always Allow Functionality** - Smart command pattern matching for common tools (npm, git, docker)
- **YOLO Mode** - Skip all permission checks for power users
- **Workspace Permissions** - Granular control over what tools can execute
- **Real-time Permission Management** - Add/remove permissions through intuitive UI

### 🖼️ **Image & Clipboard Support** ⭐ **NEW IN V1.0**
- **Drag & Drop Images** - Simply drag images directly into the chat
- **Clipboard Paste** - Press Ctrl+V to paste screenshots and copied images
- **Multiple Image Selection** - Choose multiple images through VS Code's file picker
- **Organized Storage** - Automatic organization in `.claude/claude-code-chat-images/`
- **Format Support** - PNG, JPG, JPEG, GIF, SVG, WebP, BMP formats

### 📱 **Sidebar Integration** ⭐ **NEW IN V1.0**
- **Native VS Code Sidebar** - Full chat functionality in the sidebar panel
- **Smart Panel Management** - Automatic switching between main and sidebar views
- **Persistent Sessions** - State maintained across panel switches
- **Activity Bar Integration** - Quick access from VS Code's activity bar

### 📁 **Smart File Integration**
- Type `@` to instantly search and reference workspace files
- Image attachments via file browser and copy-paste screeshots
- Lightning-fast file search across your entire project
- Seamless context preservation for multi-file discussions

### 🛠️ **Tool Management**
- Visual dashboard showing all available Claude Code tools
- Real-time tool execution with formatted results
- Process control - start, stop, and monitor operations
- Smart permission system for secure tool execution

### 🎨 **VS Code Integration**
- Native theming that matches your editor
- Status bar integration with connection status
- Activity bar panel for quick access
- Responsive design for any screen size

### 🤖 **Model Selection**
- **Opus** - Most capable model for complex tasks requiring deep reasoning
- **Sonnet** - Balanced model offering great performance for most use cases
- **Default** - Uses your configured model setting
- Model preference persists across sessions and is saved automatically
- Easy switching via dropdown selector in the chat interface
- Visual confirmation when switching between models
- One-click model configuration through integrated terminal

### ⚡ **Slash Commands Integration**
- **Slash Commands Modal** - Type "/" to access all Claude Code commands instantly
- **23+ Built-in Commands** - /agents, /cost, /config, /memory, /review, and more
- **Custom Command Support** - Execute any Claude Code command with session context
- **Session-Aware Execution** - All commands run with current conversation context
- **Terminal Integration** - Commands open directly in VS Code terminal with WSL support

### 🧠 **Advanced AI Modes**
- **Plan First Mode** - Toggle to make Claude plan before implementing changes
- **Thinking Mode** - Configurable intensity levels (Think, Think Hard, Think Harder, Ultrathink)
- **Mode Toggles** - Simple switches above the text input area
- **Intelligent Prompting** - Different prompts based on selected thinking intensity
- **Token Awareness** - Higher thinking levels consume more tokens but provide deeper reasoning

---

## 🚀 **Getting Started**

### Prerequisites
- **VS Code 1.80+** - Latest version recommended
- **Claude Code CLI** - [Install from Anthropic](https://claude.ai/code)
- **Active Claude API or subscription** - API or Pro/Max plan

### Installation

1. **Install from VS Code Marketplace**
   ```
   ext install claude-code-chat
   ```

2. **Or install manually**
   - Download the `.vsix` file from releases
   - Run `code --install-extension claude-code-chat-x.x.x.vsix`

3. **Open Claude Code Chat**
   - Press `Ctrl+Shift+C` (or `Cmd+Shift+C` on Mac)
   - Or click the Claude icon in your status bar
   - Or use Command Palette: `Claude Code: Open Chat`

---

## 💡 **Usage Examples**

### 🔥 **Code Review & Refactoring**
```
You: @src/components/UserProfile.tsx Can you review this component and suggest improvements?

Claude: I'll analyze your UserProfile component. Looking at the code, here are my recommendations:

1. **Performance Optimization**: Add React.memo() to prevent unnecessary re-renders
2. **TypeScript Enhancement**: The props interface could be more specific
3. **Accessibility**: Missing ARIA labels for screen readers

[Detailed analysis with code examples follows...]
```

### 📊 **Project Analysis**
```
You: Analyze the overall architecture of my project and identify potential issues

Claude: I'll examine your project structure and identify areas for improvement:

🏗️ **Architecture Overview**
- React frontend with TypeScript
- Node.js backend with Express
- MongoDB database layer

⚠️ **Identified Issues**
- Missing error boundaries in React components
- Database queries lack proper indexing
- API routes missing input validation

[Detailed recommendations with implementation examples...]
```

### 🐛 **Debugging Assistant**
```
You: I'm getting a strange error in my API. Here's the stack trace: [paste error]

Claude: Looking at this stack trace, the issue appears to be a race condition in your async middleware. Here's what's happening:

1. **Root Cause**: Multiple requests are modifying shared state
2. **Solution**: Implement proper request isolation
3. **Prevention**: Add comprehensive error handling

[Step-by-step debugging guide follows...]
```

### ⏪ **Safe Experimentation with Checkpoints**
```
You: Can you refactor this entire component to use hooks instead of class components?

Claude: I'll refactor your component to use React hooks. Don't worry - I'll create a checkpoint first so you can easily restore if needed.

[Creates automatic checkpoint]

Here's the refactored component using hooks:
[Shows the new implementation]

If you want to revert these changes, just click "Restore Checkpoint" to go back to your original code instantly.
```

---

## ⚙️ **Configuration**

### Keyboard Shortcuts
| Shortcut | Action |
|----------|--------|
| `Ctrl+Shift+C` | Open Claude Code Chat |
| `Enter` | Send message |
| `@` | Open file picker |
| `/` | Open slash commands modal |

### WSL Configuration (Windows Users)
If you're using Claude Code through WSL (Windows Subsystem for Linux), you can configure the extension to use WSL:

1. Open VS Code Settings (`Ctrl+,` or `Cmd+,`)
2. Search for "Claude Code Chat"
3. Configure these settings:
   - **Claude Code Chat: WSL Enabled** - Enable WSL integration
   - **Claude Code Chat: WSL Distro** - Your WSL distribution name (e.g., `Ubuntu`, `Debian`)
   - **Claude Code Chat: WSL Node Path** - Path to Node.js in WSL (default: `/usr/bin/node`)
   - **Claude Code Chat: WSL Claude Path** - Path to Claude in WSL (default: `/usr/local/bin/claude`)

Example configuration in `settings.json`:
```json
{
  "claudeCodeChat.wsl.enabled": true,
  "claudeCodeChat.wsl.distro": "Ubuntu",
  "claudeCodeChat.wsl.nodePath": "/usr/bin/node",
  "claudeCodeChat.wsl.claudePath": "/usr/local/bin/claude"
}
```

---

## 🎯 **Pro Tips & Tricks**

### 🔥 **File Context Magic**
- Type `@` followed by your search term to quickly reference files
- Use `@src/` to narrow down to specific directories
- Reference multiple files in one message for cross-file analysis
- **NEW**: Copy-paste images directly into chat for visual context
- **NEW**: Paste screenshots with Ctrl+V for instant visual communication

### ⚡ **Productivity Boosters**
- **Creates checkpoints automatically** before changes for safe experimentation
- **Restore instantly** if changes don't work out as expected
- **NEW**: Permission system prevents accidental tool execution
- **NEW**: YOLO mode for power users who want speed over safety
- Use the stop button to cancel long-running operations
- Copy message contents to reuse Claude's responses
- Open history panel to reference previous conversations
- **NEW**: Sidebar integration for multi-panel workflow

### 🎨 **Interface Customization**
- The UI automatically adapts to your VS Code theme
- Messages are color-coded: Green for you, Blue for Claude
- Hover over messages to reveal the copy button
- **NEW**: Enhanced code block rendering with syntax highlighting
- **NEW**: Copy-to-clipboard functionality for code blocks

---

## 🔧 **Advanced Features**

### 🛠️ **Tool Integration**
Claude Code Chat provides secure access to all Claude Code tools:
- **Bash** - Execute shell commands with permission controls
- **File Operations** - Read, write, and edit files
- **Search** - Grep and glob pattern matching across workspace
- **Web** - Fetch and search web content
- **Multi-edit** - Batch file modifications
- **MCP Servers** - Extend functionality with Model Context Protocol servers
- **Permissions System** - Granular control over tool execution for security

### 📊 **Analytics & Monitoring**
- **Real-time cost tracking** - Monitor your API usage
- **Token consumption** - See input/output token counts
- **Response timing** - Track performance metrics
- **Session statistics** - Comprehensive usage analytics

### ⏪ **Checkpoint System**
- **Instant restoration** - One-click restore to any previous state
- **Conversation checkpoints** - Every change creates a restore point
- **Visual timeline** - See and navigate through all your project states

### 🔄 **Conversation History**
- **Automatic saving** - Every conversation is preserved
- **Smart restoration** - Resume exactly where you left off
- **Switch between chats** - Easily check and switch to previous conversations

---

## 🤝 **Contributing**

We welcome contributions! Here's how you can help:

1. **🐛 Report Bugs** - Use our issue tracker
2. **💡 Suggest Features** - Share your ideas
3. **🔧 Submit PRs** - Help us improve the codebase
4. **📚 Improve Docs** - Make the documentation better

### Development Setup
```bash
git clone https://github.com/andrepimenta/claude-code-chat
cd claude-code-chat
npm install

Click "F5" to run the extension or access the "Run and Debug" section in VSCode
```

### Repository Structure

```
claude-code-chat/
├── src/
│   ├── extension.ts              # Main extension entry point & orchestration
│   ├── ui.ts                     # Webview HTML generation
│   ├── ui-styles.ts              # Inline styles for webview
│   ├── script.ts                 # Script initialization
│   │
│   ├── handlers/                 # Message & stream processing
│   │   ├── index.ts              # Central exports for handlers
│   │   ├── StreamParser.ts       # Parses Claude CLI JSON stream output
│   │   ├── StreamCallbacksFactory.ts # Creates callbacks for stream events
│   │   ├── WebviewMessageHandler.ts  # Routes messages from webview
│   │   ├── ConversationHandler.ts    # Conversation switching & loading
│   │   ├── PermissionRequestHandler.ts # Permission prompts & responses
│   │   ├── MCPHandler.ts         # MCP server configuration
│   │   └── VSCodeUtilities.ts    # VS Code API wrappers (diff, files, etc.)
│   │
│   ├── managers/                 # Business logic & state management
│   │   ├── index.ts              # Central exports for managers
│   │   ├── ProcessManager.ts     # Claude CLI process lifecycle
│   │   ├── ConversationManager.ts # Conversation persistence & history
│   │   └── PermissionManager.ts  # Permission rules & auto-approval
│   │
│   ├── types/                    # TypeScript type definitions
│   │   ├── index.ts              # Central exports for types
│   │   ├── conversations.ts      # Conversation data structures
│   │   ├── messages.ts           # Message types
│   │   └── settings.ts           # Configuration interfaces
│   │
│   ├── utils/                    # Utility functions
│   │   ├── index.ts              # Central exports for utilities
│   │   ├── PathConverter.ts      # WSL path conversion
│   │   └── ProcessKiller.ts      # Cross-platform process termination
│   │
│   └── webview/                  # Frontend (JavaScript/CSS)
│       ├── script.js             # Main entry point, loads all modules
│       ├── init.js               # Initialization & VS Code API setup
│       ├── state.js              # Centralized state management
│       ├── message-handler.js    # Handles messages from extension
│       ├── message-rendering.js  # Renders chat messages to DOM
│       ├── event-listeners.js    # DOM event binding
│       ├── session-management.js # Session & history UI
│       ├── conversation-tabs.js  # Multi-conversation tab management
│       ├── permissions.js        # Permission dialog UI
│       ├── mcp-servers.js        # MCP server configuration UI
│       ├── modals.js             # Modal dialog management
│       ├── markdown.js           # Markdown-to-HTML conversion
│       ├── diff-formatting.js    # Diff visualization
│       ├── tool-display.js       # Tool execution display
│       ├── file-picker.js        # @ file reference picker
│       ├── ui-helpers.js         # Common UI utilities
│       ├── utils.js              # General utilities
│       └── styles.css            # All styles (dark/light themes)
│
├── test/                         # Test files
│   ├── extension.test.ts
│   ├── handlers/
│   ├── managers/
│   ├── utils/
│   └── integration/
│
├── package.json                  # Extension manifest & dependencies
├── tsconfig.json                 # TypeScript configuration
└── eslint.config.mjs             # ESLint configuration
```

### Key Files Explained

#### Extension Core (`src/`)

| File | Purpose |
|------|---------|
| `extension.ts` | Main entry point. Creates `ClaudeChatProvider` instances, registers commands, and orchestrates all components. |
| `ui.ts` | Generates the webview HTML with proper CSP headers and resource URIs. |

#### Handlers (`src/handlers/`)

| File | Purpose |
|------|---------|
| `StreamParser.ts` | Parses the JSON stream from Claude CLI (`tool_use`, `text_delta`, `result`, etc.) and triggers callbacks. |
| `StreamCallbacksFactory.ts` | Creates the callback functions that handle parsed stream events and route them to the UI. |
| `ConversationHandler.ts` | Manages switching between conversations, loading from history, and tracking active conversations. |
| `PermissionRequestHandler.ts` | Handles permission prompts from Claude, manages pending requests, and sends responses back. |
| `MCPHandler.ts` | Reads/writes MCP server configuration from `~/.claude/mcp_servers.json`. |
| `VSCodeUtilities.ts` | Wrappers for VS Code APIs: opening diffs, files, terminals, and handling images. |

#### Managers (`src/managers/`)

| File | Purpose |
|------|---------|
| `ProcessManager.ts` | Spawns and manages the Claude CLI process, handles stdin/stdout, supports WSL. |
| `ConversationManager.ts` | Persists conversations to `~/.claude/conversations/`, manages history index, tracks usage stats. |
| `PermissionManager.ts` | Stores permission rules, checks auto-approval patterns, handles "always allow" logic. |

#### Utilities (`src/utils/`)

| File | Purpose |
|------|---------|
| `PathConverter.ts` | Converts Windows paths to WSL paths and vice versa. |
| `ProcessKiller.ts` | Cross-platform process termination (handles Windows `taskkill` vs Unix `kill`). |

#### Webview (`src/webview/`)

| File | Purpose |
|------|---------|
| `state.js` | Centralized state: `isProcessing`, `messageQueue`, token counts, etc. |
| `message-handler.js` | Main message router - handles all `postMessage` events from the extension. |
| `message-rendering.js` | Creates DOM elements for user/assistant/system messages. |
| `conversation-tabs.js` | Tab UI for switching between multiple active conversations. |
| `permissions.js` | Renders permission request dialogs with approve/deny/always-allow options. |
| `diff-formatting.js` | Formats and displays file diffs with syntax highlighting. |
| `markdown.js` | Converts markdown to HTML with code block handling. |
| `session-management.js` | History panel, new session creation, conversation list display. |

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         VS Code Extension                        │
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
│  └─────────────┘     └─────────────┘     └─────────────────┘   │
│           │                    │                                 │
│           ▼                    ▼                                 │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                    Claude CLI Process                        ││
│  │                  (JSON stream via stdin/stdout)              ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

**Data Flow:**
1. User types message in webview → `message-handler.js`
2. Webview sends `postMessage` → `extension.ts`
3. Extension spawns Claude CLI via `ProcessManager`
4. Claude output parsed by `StreamParser` → callbacks from `StreamCallbacksFactory`
5. Callbacks update `ConversationManager` and send messages back to webview
6. Webview renders updates via `message-rendering.js`

---

## 📝 **License**

See the [LICENSE](LICENSE) file for details.

---

## 🙏 **Acknowledgments**

- **Anthropic** - For creating the amazing Claude AI and more specifically the Claude Code SDK
- **VS Code Team** - For the incredible extension platform
- **Our Community** - For feedback, suggestions, and contributions

---

## 📞 **Support**

Need help? We've got you covered:

- 🐛 **Issues**: [GitHub Issues](https://github.com/andrepimenta/claude-code-chat/issues)

---

<div align="center">

**⭐ Star us on GitHub if this project helped you!**

[**Download Now**](https://marketplace.visualstudio.com/items?itemName=andrepimenta.claude-code-chat)

</div>
