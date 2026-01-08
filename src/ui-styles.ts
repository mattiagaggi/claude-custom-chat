/**
 * CSS styles for the webview
 * Note: The actual CSS has been moved to src/webview/styles.css
 * This file now just provides the link tag for loading it
 */

const styles = (styleUri: string) => `
<link rel="stylesheet" href="${styleUri}">
`;

export default styles;
