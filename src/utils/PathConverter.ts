/**
 * PathConverter.ts - WSL Path Conversion Utilities
 *
 * Converts paths between Windows and WSL (Windows Subsystem for Linux) formats.
 * Used when running Claude CLI through WSL on Windows.
 * Example: C:\Users\name\project → /mnt/c/users/name/project
 */

/**
 * Convert Windows path to WSL path format
 * Example: C:\Users\... → /mnt/c/users/...
 */
export function convertToWSLPath(windowsPath: string, wslEnabled: boolean): string {
	if (wslEnabled && windowsPath.match(/^[a-zA-Z]:/)) {
		// Convert C:\Users\... to /mnt/c/Users/...
		return windowsPath.replace(/^([a-zA-Z]):/, '/mnt/$1').toLowerCase().replace(/\\/g, '/');
	}

	return windowsPath;
}
