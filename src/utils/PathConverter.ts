/**
 * Utility for converting paths between Windows and WSL formats
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
