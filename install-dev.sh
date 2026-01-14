#!/bin/bash
set -e

echo "🚀 Installing Claude Custom Chat Extension (Development Mode)"
echo "============================================================="

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

# Check if VS Code is installed
if ! command -v code &> /dev/null; then
    echo "❌ Error: VS Code 'code' command not found in PATH"
    echo "   Please install VS Code and ensure 'code' command is available"
    echo "   Run: View > Command Palette > Shell Command: Install 'code' command in PATH"
    exit 1
fi

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Compile TypeScript
echo "🔨 Compiling TypeScript..."
npm run compile

# Get the extension ID from package.json
EXTENSION_NAME=$(node -p "require('./package.json').name")
PUBLISHER=$(node -p "require('./package.json').publisher")
EXTENSION_ID="${PUBLISHER}.${EXTENSION_NAME}"

echo "📋 Extension ID: $EXTENSION_ID"

# Uninstall existing version if present
echo "🗑️  Removing existing version (if any)..."
code --uninstall-extension "$EXTENSION_ID" 2>/dev/null || true

# Find extensions directory (supports VS Code, Cursor, and other forks)
VSCODE_EXT_DIR=""
EDITOR_NAME=""

# Check for various VS Code forks' extension directories
if [ -d "$HOME/.cursor/extensions" ]; then
    VSCODE_EXT_DIR="$HOME/.cursor/extensions"
    EDITOR_NAME="Cursor"
elif [ -d "$HOME/.antigravity/extensions" ]; then
    VSCODE_EXT_DIR="$HOME/.antigravity/extensions"
    EDITOR_NAME="Antigravity"
elif [ -d "$HOME/.antigravity" ]; then
    VSCODE_EXT_DIR="$HOME/.antigravity/extensions"
    EDITOR_NAME="Antigravity"
elif [ -d "$HOME/.vscode/extensions" ]; then
    VSCODE_EXT_DIR="$HOME/.vscode/extensions"
    EDITOR_NAME="VS Code"
elif [ -d "$HOME/.vscode" ]; then
    VSCODE_EXT_DIR="$HOME/.vscode/extensions"
    EDITOR_NAME="VS Code"
else
    # Default to VS Code path
    VSCODE_EXT_DIR="$HOME/.vscode/extensions"
    EDITOR_NAME="VS Code"
fi

echo "📂 Detected editor: $EDITOR_NAME"
echo "📁 Extensions directory: $VSCODE_EXT_DIR"

# Create extensions directory if it doesn't exist
mkdir -p "$VSCODE_EXT_DIR"

# Create symlink name with version
VERSION=$(node -p "require('./package.json').version")
SYMLINK_NAME="${EXTENSION_ID}-${VERSION}"
SYMLINK_PATH="$VSCODE_EXT_DIR/$SYMLINK_NAME"

# Remove old symlink if exists
if [ -L "$SYMLINK_PATH" ]; then
    echo "🗑️  Removing old symlink..."
    rm "$SYMLINK_PATH"
fi

# Create new symlink
echo "🔗 Creating symlink: $SYMLINK_PATH -> $SCRIPT_DIR"
ln -s "$SCRIPT_DIR" "$SYMLINK_PATH"

echo ""
echo "✅ Installation complete!"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🚀 QUICK START"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "1. Restart $EDITOR_NAME or reload window (Cmd/Ctrl + R)"
echo "2. Press Ctrl+Shift+C (or Cmd+Shift+C on Mac) to open Claude Custom Chat"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🛠️  DEV MODE TUTORIAL - Full Workflow"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Dev Mode lets Claude modify the extension's own source code safely."
echo ""
echo "📋 WORKFLOW:"
echo ""
echo "  Step 1: Enable Dev Mode"
echo "    • Click the 🛠️ button in the chat header"
echo "    • A snapshot is automatically created"
echo "    • Tips bar appears with helpful reminders"
echo ""
echo "  Step 2: Ask Claude to Make Changes"
echo "    • \"Add a dark theme toggle\""
echo "    • \"Change the chat bubble colors\""
echo "    • \"Add a feature to export chat history\""
echo "    • Claude has access to extension source via MCP tools"
echo ""
echo "  Step 3: Auto-Compile & Reload"
echo "    • Changes trigger automatic compilation"
echo "    • Click \"Reload Now\" when prompted"
echo "    • Window reloads with your changes"
echo ""
echo "  Step 4: Test Your Changes"
echo "    • Try out the new features"
echo "    • Check if everything works as expected"
echo ""
echo "  Step 5: Keep or Rollback"
echo "    ✅ If you like it: Continue or disable dev mode"
echo "    ↩️  If you don't: Use rollback (see below)"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "↩️  ROLLBACK INSTRUCTIONS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Snapshots are saved to disk, so rollback works even after reload!"
echo ""
echo "METHOD 1: Quick Rollback (Latest Snapshot)"
echo "  1. Open Command Palette (Cmd/Ctrl + Shift + P)"
echo "  2. Type: \"Claude Custom Chat: Dev Mode: Rollback to Latest Snapshot\""
echo "  3. Confirm the rollback"
echo "  4. Extension auto-recompiles"
echo "  5. Click \"Reload Now\" to apply"
echo ""
echo "METHOD 2: Pick a Specific Snapshot"
echo "  1. Open Command Palette (Cmd/Ctrl + Shift + P)"
echo "  2. Type: \"Claude Custom Chat: Dev Mode: Pick and Rollback to Snapshot\""
echo "  3. Select from list (shows date, branch, commit)"
echo "  4. Confirm the rollback"
echo "  5. Extension auto-recompiles"
echo "  6. Click \"Reload Now\" to apply"
echo ""
echo "📁 Snapshots location: .devmode-snapshots/"
echo "🗑️  To clear snapshots: \"Claude Custom Chat: Dev Mode: Clear All Snapshots\""
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔧 MANUAL DEVELOPMENT (Without Dev Mode)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "  • Edit code in: $SCRIPT_DIR"
echo "  • Run: npm run compile"
echo "  • Reload window: Cmd/Ctrl + R"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🌿 GIT WORKFLOW"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "  • Use the 🚀 Push button in the extension UI"
echo "  • Or manually: git add . && git commit -m 'message' && git push"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
