# Next Steps to Complete Refactoring

## Current Status

**✅ Completed:** 12 modular files created (~70 KB extracted)
**⏳ Remaining:** script.js still contains ~1,500 lines of code

## What's Still in script.js

The original script.js (3,322 lines) still contains:

1. **Window message handler** (~340 lines, lines 2041-2380)
   - Handles all messages from VS Code extension
   - 30+ message types (ready, output, toolUse, toolResult, etc.)

2. **Event listeners** (~40+ addEventListener calls)
   - Input handlers
   - Modal click handlers
   - Keyboard event handlers
   - Form submissions

3. **Some initialization code** that's intermingled with event listeners

## Option 1: Extract Everything (Recommended)

Create two more files to fully modularize:

### A. Create `message-handler.js`

Extract lines 2041-2380 with the main window message handler.

```javascript
// message-handler.js
window.addEventListener('message', event => {
	const message = event.data;

	switch (message.type) {
		case 'ready':
			// ... ~30 cases
	}
});
```

### B. Create `event-listeners.js`

Extract all addEventListener calls:

```javascript
// event-listeners.js
// Textarea input handlers
messageInput.addEventListener('input', adjustTextareaHeight);
messageInput.addEventListener('input', () => {
	// Save input debounced
});

// Keydown handlers
messageInput.addEventListener('keydown', (e) => {
	// Handle Enter, @, Escape, etc.
});

// Modal click handlers
document.getElementById('settingsModal').addEventListener('click', (e) => {
	if (e.target === document.getElementById('settingsModal')) {
		hideSettingsModal();
	}
});

// ... all other event listeners
```

### C. Reduce script.js to minimal init

```javascript
// script.js (final ~20 lines)
// This file is now just the entry point
// All functionality is in the imported modules

// Request initial data from extension
vscode.postMessage({ type: 'ready' });

// Request custom snippets
vscode.postMessage({ type: 'getCustomSnippets' });

// Platform info for WSL alert
vscode.postMessage({ type: 'getPlatformInfo' });
```

### D. Update ui.ts

Add the two new modules to the load order:

```typescript
<script src="${scriptUri.replace('script.js', 'message-handler.js')}"></script>
<script src="${scriptUri.replace('script.js', 'event-listeners.js')}"></script>
<script src="${scriptUri}"></script>  // Now just initialization
```

## Option 2: Keep script.js as Coordinator (Current State)

**Pros:**
- Less risky - gradual refactoring
- Easier to test incrementally
- Already 90% modularized

**Cons:**
- script.js still large (~1,500 lines)
- Not fully modular

## Recommendation

**Go with Option 1** to complete the refactoring. The benefits:

1. ✅ **Fully modular** - each file has one clear purpose
2. ✅ **Easy testing** - can test message handler and event listeners separately
3. ✅ **Better organization** - everything in logical modules
4. ✅ **Minimal main file** - script.js becomes a clean entry point
5. ✅ **Future-proof** - easy to add new features

## How to Execute

Run these commands:

```bash
# Extract message handler
awk 'NR>=2041 && NR<=2380' src/webview/script.js > src/webview/message-handler.js

# Extract event listeners (requires manual work to find all of them)
# Or use a script to extract all lines containing addEventListener

# Create minimal script.js with just initialization
```

Would you like me to complete this extraction?
