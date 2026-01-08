# Webview Script Refactoring Progress

## Overview
The monolithic `src/webview/script.js` file (3,322 lines) has been split into modular files for better maintainability.

## Created Modules

### ✅ Completed Modules

1. **state.js** (29 lines)
   - Global variables and state management
   - DOM element references
   - Initialization

2. **utils.js** (42 lines)
   - `escapeHtml()` - HTML escaping
   - `formatFilePath()` - File path formatting
   - `getFileIcon()` - File type icons
   - `openFileInEditor()` - VS Code editor integration

3. **markdown.js** (169 lines)
   - `parseSimpleMarkdown()` - Markdown to HTML conversion
   - `copyCodeBlock()` - Code block copying with feedback
   - Code block placeholder management

4. **ui-helpers.js** (243 lines)
   - `shouldAutoScroll()`, `scrollToBottomIfNeeded()` - Scroll management
   - `openDiffEditor()` - Diff editor launching
   - `updateStatus()`, `updateStatusHtml()`, `updateStatusWithTotals()` - Status bar
   - `showProcessingIndicator()`, `hideProcessingIndicator()` - Loading states
   - `adjustTextareaHeight()` - Dynamic textarea resizing
   - `showStopButton()`, `hideStopButton()`, `stopRequest()` - Request control
   - `disableButtons()`, `enableButtons()` - Button state management
   - `toggleExpand()`, `toggleDiffExpansion()`, `toggleResultExpansion()` - Expansion controls
   - `copyMessageContent()` - Message copying

5. **diff-formatting.js** (372 lines)
   - `formatToolInputUI()` - Tool input formatting
   - `computeLineDiff()` - LCS-based diff algorithm
   - `parseToolResult()` - Tool result parsing
   - `generateUnifiedDiffHTML()` - Unified diff visualization
   - `formatEditToolDiff()` - Edit tool diff formatting
   - `formatMultiEditToolDiff()` - MultiEdit tool diff formatting
   - `formatWriteToolDiff()` - Write tool diff formatting

6. **message-rendering.js** (128 lines)
   - `currentStreamingMessageId` - Streaming state
   - `appendToLastClaudeMessage()` - Streaming message appending
   - `addMessage()` - Main message rendering
   - `sendMessage()` - Message sending
   - `togglePlanMode()`, `toggleThinkingMode()` - Mode toggles
   - `sendStats()` - Analytics

7. **tool-display.js** (252 lines)
   - `addToolUseMessage()` - Tool execution display
   - `addToolResultMessage()` - Tool result display
   - TodoWrite special formatting
   - Edit/MultiEdit/Write diff integration
   - Permission error detection

8. **file-picker.js** (101 lines)
   - `showFilePicker()`, `hideFilePicker()` - Modal control
   - `renderFileList()` - File list rendering
   - `selectFile()` - File selection and insertion
   - `filterFiles()` - File search
   - `selectImage()` - Image attachment
   - `showImageAddedFeedback()` - Image feedback

9. **session-management.js** (154 lines)
   - `newSession()` - New chat session
   - `restoreToCommit()` - Session restoration
   - `showRestoreContainer()`, `hideRestoreContainer()` - Restore UI
   - `showSessionInfo()`, `hideSessionInfo()` - Session info display
   - `copySessionId()` - Session ID copying
   - `toggleConversationHistory()` - History panel
   - `requestConversationList()`, `loadConversation()` - History management
   - `displayConversationList()` - Conversation list rendering
   - `handleClipboardText()` - Clipboard handling

## ✅ All Core Modules Created

10. **permissions.js** (206 lines) ✅
    - `addPermissionRequestMessage()` - Permission request UI
    - `updatePermissionStatus()` - Status updates
    - `expireAllPendingPermissions()` - Expiration handling
    - `respondToPermission()` - Permission responses
    - `togglePermissionMenu()` - Menu control
    - `enableYoloMode()` - YOLO mode activation
    - `isPermissionError()` - Error detection

11. **mcp-servers.js** (252 lines) ✅
    - `showMCPModal()`, `hideMCPModal()` - Modal control
    - `loadMCPServers()` - Server loading
    - `showAddServerForm()`, `hideAddServerForm()` - Form control
    - `updateServerForm()` - Dynamic form updates
    - `saveMCPServer()` - Server configuration saving
    - `deleteMCPServer()` - Server deletion
    - `editMCPServer()` - Server editing
    - `addPopularServer()` - Popular server templates
    - `displayMCPServers()` - Server list rendering
    - `updateYoloWarning()` - YOLO mode warning display

12. **modals.js** (330 lines) ✅
    - Slash commands modal (`showSlashCommandsModal`, `hideSlashCommandsModal`, `executeSlashCommand`)
    - Model selector modal (`showModelSelector`, `selectModel`, `openModelTerminal`)
    - Thinking intensity modal (full suite of functions)
    - WSL alert functions (`showWSLAlert`, `dismissWSLAlert`, `openWSLSettings`)
    - Settings modal (`toggleSettings`, `updateSettings`)
    - Permissions management UI (`renderPermissions`, `addPermission`, `removePermission`)
    - Installation modal (`showInstallModal`, `startInstallation`, `handleInstallComplete`)
    - Custom snippets (`usePromptSnippet`, `loadCustomSnippets`, `saveCustomSnippet`)

### 🚧 Remaining in script.js (to extract or keep)

13. **Window message handler** (~300 lines, lines 2041-2382)
    - Main `window.addEventListener('message')` handler
    - All message type cases (ready, output, userInput, toolUse, etc.)
    - State updates from extension

14. **Event listeners** (~200 lines, scattered)
    - Input event handlers (textarea, file picker, etc.)
    - Modal click handlers
    - Keyboard event handlers

## Next Steps

### 1. Complete Remaining Modules
Extract and clean up the remaining sections:
- Create permissions.js from /tmp/permissions-extract.js
- Create mcp-servers.js from /tmp/mcp-servers-extract.js
- Create slash-commands.js from /tmp/slash-commands-extract.js
- Create modals.js (combine settings, thinking intensity, model selector, WSL, installation)
- Create message-handler.js (lines 2041-2382)
- Create event-listeners.js (gather all addEventListener calls)

### 2. Update HTML Loading
Modify `src/ui.ts` line 777 to load all modules in dependency order:

```html
<script src="state.js"></script>
<script src="utils.js"></script>
<script src="markdown.js"></script>
<script src="ui-helpers.js"></script>
<script src="diff-formatting.js"></script>
<script src="message-rendering.js"></script>
<script src="tool-display.js"></script>
<script src="file-picker.js"></script>
<script src="session-management.js"></script>
<script src="permissions.js"></script>
<script src="mcp-servers.js"></script>
<script src="slash-commands.js"></script>
<script src="modals.js"></script>
<script src="message-handler.js"></script>
<script src="event-listeners.js"></script>
```

### 3. Testing
- Load the webview and verify all functions are accessible
- Test each major feature area:
  - Message sending and rendering
  - Tool execution display
  - File picker (@-mentions)
  - Slash commands
  - MCP server configuration
  - Permission requests
  - Session management
  - Settings panel

### 4. Clean Up
- Delete or archive original `script.js`
- Update build scripts if needed
- Update documentation

## Module Dependencies

```
state.js (no dependencies)
  ↓
utils.js (uses: vscode from state)
  ↓
markdown.js (uses: escapeHtml, copyCodeBlock)
  ↓
ui-helpers.js (uses: state vars, updateStatus functions)
  ↓
diff-formatting.js (uses: escapeHtml, formatFilePath, openFileInEditor)
  ↓
message-rendering.js (uses: shouldAutoScroll, isPermissionError, moveProcessingIndicatorToLast)
  ↓
tool-display.js (uses: diff-formatting, message-rendering)
  ↓
file-picker.js (uses: utils, ui-helpers)
session-management.js (uses: sendStats, ui-helpers)
permissions.js (uses: message-rendering, ui-helpers)
mcp-servers.js (uses: addMessage, sendStats)
slash-commands.js (uses: messageInput, adjustTextareaHeight)
modals.js (uses: various utilities)
  ↓
message-handler.js (uses: all above modules)
  ↓
event-listeners.js (uses: all above modules)
```

## Benefits of Refactoring

1. **Maintainability**: Easier to find and modify specific functionality
2. **Readability**: Each module has a clear, focused purpose
3. **Testability**: Modules can be tested in isolation
4. **Collaboration**: Multiple developers can work on different modules
5. **Performance**: Browser can cache individual modules
6. **Organization**: Logical grouping makes codebase navigation easier

## File Size Reduction

- **Original**: script.js (3,322 lines, 113 KB)
- **New**: 15 focused modules (average ~220 lines each)
- **Largest module**: mcp-servers.js (367 lines)
- **Smallest module**: state.js (29 lines)
