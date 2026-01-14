# PowerShell installation script for Claude Custom Chat Extension (Development Mode)
# Compatible with Windows PowerShell 5.1+ and PowerShell 7+

$ErrorActionPreference = "Stop"

Write-Host "🚀 Installing Claude Custom Chat Extension (Development Mode)" -ForegroundColor Cyan
Write-Host "=============================================================" -ForegroundColor Cyan
Write-Host ""

# Get the directory where this script is located
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ScriptDir

# Check if VS Code is installed
$codeCommand = Get-Command code -ErrorAction SilentlyContinue
if (-not $codeCommand) {
    Write-Host "❌ Error: VS Code 'code' command not found in PATH" -ForegroundColor Red
    Write-Host "   Please install VS Code and ensure 'code' command is available" -ForegroundColor Yellow
    Write-Host "   Run: View > Command Palette > Shell Command: Install 'code' command in PATH" -ForegroundColor Yellow
    exit 1
}

# Check for Node.js
$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCommand) {
    Write-Host "❌ Error: Node.js not found in PATH" -ForegroundColor Red
    Write-Host "   Please install Node.js from https://nodejs.org" -ForegroundColor Yellow
    exit 1
}

# Install dependencies
Write-Host "📦 Installing dependencies..." -ForegroundColor Yellow
npm install
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Failed to install dependencies" -ForegroundColor Red
    exit 1
}

# Compile TypeScript
Write-Host "🔨 Compiling TypeScript..." -ForegroundColor Yellow
npm run compile
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Failed to compile TypeScript" -ForegroundColor Red
    exit 1
}

# Get the extension ID from package.json
$packageJson = Get-Content -Path "package.json" -Raw | ConvertFrom-Json
$ExtensionName = $packageJson.name
$Publisher = $packageJson.publisher
$ExtensionId = "$Publisher.$ExtensionName"
$Version = $packageJson.version

Write-Host "📋 Extension ID: $ExtensionId" -ForegroundColor Cyan

# Uninstall existing version if present
Write-Host "🗑️  Removing existing version (if any)..." -ForegroundColor Yellow
code --uninstall-extension "$ExtensionId" 2>$null

# Find extensions directory (supports VS Code, Cursor, and other forks)
$VsCodeExtDir = $null
$EditorName = $null

# Check for various VS Code forks' extension directories
$possiblePaths = @(
    @{Path = "$env:USERPROFILE\.cursor\extensions"; Editor = "Cursor"},
    @{Path = "$env:USERPROFILE\.antigravity\extensions"; Editor = "Antigravity"},
    @{Path = "$env:USERPROFILE\.vscode\extensions"; Editor = "VS Code"},
    @{Path = "$env:APPDATA\Code\User\extensions"; Editor = "VS Code"}
)

foreach ($pathInfo in $possiblePaths) {
    if (Test-Path $pathInfo.Path) {
        $VsCodeExtDir = $pathInfo.Path
        $EditorName = $pathInfo.Editor
        break
    }
}

# Default to VS Code path if nothing found
if (-not $VsCodeExtDir) {
    $VsCodeExtDir = "$env:USERPROFILE\.vscode\extensions"
    $EditorName = "VS Code"
}

Write-Host "📂 Detected editor: $EditorName" -ForegroundColor Cyan
Write-Host "📁 Extensions directory: $VsCodeExtDir" -ForegroundColor Cyan

# Create extensions directory if it doesn't exist
if (-not (Test-Path $VsCodeExtDir)) {
    Write-Host "📁 Creating extensions directory..." -ForegroundColor Yellow
    New-Item -ItemType Directory -Path $VsCodeExtDir -Force | Out-Null
}

# Create symlink name with version
$SymlinkName = "$ExtensionId-$Version"
$SymlinkPath = Join-Path $VsCodeExtDir $SymlinkName

# Remove old symlink if exists
if (Test-Path $SymlinkPath) {
    Write-Host "🗑️  Removing old symlink..." -ForegroundColor Yellow
    Remove-Item $SymlinkPath -Force -Recurse
}

# Create new symlink (requires administrator privileges)
Write-Host "🔗 Creating symlink: $SymlinkPath -> $ScriptDir" -ForegroundColor Yellow

try {
    # Try to create a symbolic link (requires admin privileges)
    New-Item -ItemType SymbolicLink -Path $SymlinkPath -Target $ScriptDir -Force -ErrorAction Stop | Out-Null
    Write-Host "✅ Symlink created successfully" -ForegroundColor Green
} catch {
    Write-Host "⚠️  Failed to create symlink (may require administrator privileges)" -ForegroundColor Yellow
    Write-Host "   Attempting to create junction instead..." -ForegroundColor Yellow

    try {
        # Fallback: Create a junction (doesn't require admin)
        New-Item -ItemType Junction -Path $SymlinkPath -Target $ScriptDir -Force -ErrorAction Stop | Out-Null
        Write-Host "✅ Junction created successfully" -ForegroundColor Green
    } catch {
        Write-Host "❌ Failed to create symlink or junction" -ForegroundColor Red
        Write-Host "   Please run this script as Administrator" -ForegroundColor Yellow
        Write-Host "   Right-click PowerShell and select 'Run as Administrator'" -ForegroundColor Yellow
        exit 1
    }
}

Write-Host ""
Write-Host "✅ Installation complete!" -ForegroundColor Green
Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host "🚀 QUICK START" -ForegroundColor Cyan
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host ""
Write-Host "1. Restart $EditorName or reload window (Ctrl+R)" -ForegroundColor White
Write-Host "2. Press Ctrl+Shift+C to open Claude Custom Chat" -ForegroundColor White
Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host "🛠️  DEV MODE TUTORIAL - Full Workflow" -ForegroundColor Cyan
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host ""
Write-Host "Dev Mode lets Claude modify the extension's own source code safely." -ForegroundColor White
Write-Host ""
Write-Host "📋 WORKFLOW:" -ForegroundColor Yellow
Write-Host ""
Write-Host "  Step 1: Enable Dev Mode" -ForegroundColor White
Write-Host "    • Click the 🛠️ button in the chat header" -ForegroundColor Gray
Write-Host "    • A snapshot is automatically created" -ForegroundColor Gray
Write-Host "    • Tips bar appears with helpful reminders" -ForegroundColor Gray
Write-Host ""
Write-Host "  Step 2: Ask Claude to Make Changes" -ForegroundColor White
Write-Host "    • `"Add a dark theme toggle`"" -ForegroundColor Gray
Write-Host "    • `"Change the chat bubble colors`"" -ForegroundColor Gray
Write-Host "    • `"Add a feature to export chat history`"" -ForegroundColor Gray
Write-Host "    • Claude has access to extension source via MCP tools" -ForegroundColor Gray
Write-Host ""
Write-Host "  Step 3: Auto-Compile & Reload" -ForegroundColor White
Write-Host "    • Changes trigger automatic compilation" -ForegroundColor Gray
Write-Host "    • Click `"Reload Now`" when prompted" -ForegroundColor Gray
Write-Host "    • Window reloads with your changes" -ForegroundColor Gray
Write-Host ""
Write-Host "  Step 4: Test Your Changes" -ForegroundColor White
Write-Host "    • Try out the new features" -ForegroundColor Gray
Write-Host "    • Check if everything works as expected" -ForegroundColor Gray
Write-Host ""
Write-Host "  Step 5: Keep or Rollback" -ForegroundColor White
Write-Host "    ✅ If you like it: Continue or disable dev mode" -ForegroundColor Gray
Write-Host "    ↩️  If you don't: Use rollback (see below)" -ForegroundColor Gray
Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host "↩️  ROLLBACK INSTRUCTIONS" -ForegroundColor Cyan
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host ""
Write-Host "Snapshots are saved to disk, so rollback works even after reload!" -ForegroundColor White
Write-Host ""
Write-Host "METHOD 1: Quick Rollback (Latest Snapshot)" -ForegroundColor Yellow
Write-Host "  1. Open Command Palette (Ctrl+Shift+P)" -ForegroundColor Gray
Write-Host "  2. Type: `"Claude Custom Chat: Dev Mode: Rollback to Latest Snapshot`"" -ForegroundColor Gray
Write-Host "  3. Confirm the rollback" -ForegroundColor Gray
Write-Host "  4. Extension auto-recompiles" -ForegroundColor Gray
Write-Host "  5. Click `"Reload Now`" to apply" -ForegroundColor Gray
Write-Host ""
Write-Host "METHOD 2: Pick a Specific Snapshot" -ForegroundColor Yellow
Write-Host "  1. Open Command Palette (Ctrl+Shift+P)" -ForegroundColor Gray
Write-Host "  2. Type: `"Claude Custom Chat: Dev Mode: Pick and Rollback to Snapshot`"" -ForegroundColor Gray
Write-Host "  3. Select from list (shows date, branch, commit)" -ForegroundColor Gray
Write-Host "  4. Confirm the rollback" -ForegroundColor Gray
Write-Host "  5. Extension auto-recompiles" -ForegroundColor Gray
Write-Host "  6. Click `"Reload Now`" to apply" -ForegroundColor Gray
Write-Host ""
Write-Host "📁 Snapshots location: .devmode-snapshots/" -ForegroundColor Cyan
Write-Host "🗑️  To clear snapshots: `"Claude Custom Chat: Dev Mode: Clear All Snapshots`"" -ForegroundColor Cyan
Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host "🔧 MANUAL DEVELOPMENT (Without Dev Mode)" -ForegroundColor Cyan
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host ""
Write-Host "  • Edit code in: $ScriptDir" -ForegroundColor White
Write-Host "  • Run: npm run compile" -ForegroundColor White
Write-Host "  • Reload window: Ctrl+R" -ForegroundColor White
Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host "🌿 GIT WORKFLOW" -ForegroundColor Cyan
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host ""
Write-Host "  • Use the 🚀 Push button in the extension UI" -ForegroundColor White
Write-Host "  • Or manually: git add . && git commit -m 'message' && git push" -ForegroundColor White
Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host ""
