/**
 * Settings and configuration types
 */

export interface WSLConfig {
	enabled: boolean;
	distro: string;
	nodePath: string;
	claudePath: string;
}

export interface ThinkingModeConfig {
	intensity: 'think' | 'think-hard' | 'think-harder' | 'ultrathink';
}

export interface PermissionConfig {
	yoloMode: boolean;
}
