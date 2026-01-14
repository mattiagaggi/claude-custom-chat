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
echo "📝 Next steps:"
echo "   1. Restart VS Code or reload window (Cmd/Ctrl + R)"
echo "   2. Press Ctrl+Shift+C (or Cmd+Shift+C on Mac) to open Claude Custom Chat"
echo "   3. Any changes you make to the code will require a reload (Cmd/Ctrl + R)"
echo ""
echo "🔧 Development workflow:"
echo "   - Edit code in: $SCRIPT_DIR"
echo "   - Run 'npm run compile' to rebuild"
echo "   - Reload VS Code window to see changes"
echo "   - Use Dev Mode for auto-reload on changes"
echo ""
echo "🌿 Git workflow:"
echo "   - Use the Push to Git button in the extension UI"
echo "   - Or manually: git add . && git commit -m 'message' && git push"
echo ""
