/**
 * Frontend JavaScript for the webview
 * Note: The actual JavaScript has been moved to src/webview/script.js
 * This file now just provides a fallback inline script (used when scriptUri is not provided)
 */

const getScript = (isTelemetryEnabled: boolean) => `<script>
	// Fallback inline script - normally loaded from external file
	console.warn('Using fallback inline script. This should only happen during development.');
</script>`;

export default getScript;
