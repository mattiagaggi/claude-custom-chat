/**
 * Message types for webview communication
 */

export interface WebviewMessage {
	type: string;
	[key: string]: any;
}

export interface SendMessageData {
	text: string;
	planMode?: boolean;
	thinkingMode?: boolean;
}

export interface PermissionResponseData {
	requestId: string;
	approved: boolean;
	alwaysAllow?: boolean;
}

export interface MCPServerConfig {
	command: string;
	args?: string[];
	env?: Record<string, string>;
}
