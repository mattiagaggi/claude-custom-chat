/**
 * IdleDetectionManager.ts - Idle Detection for Code Suggestions
 *
 * Manages idle detection during Claude processing to show
 * code improvement suggestions during periods of inactivity.
 */

import { CodeAnalyzer, CodeSuggestion } from './CodeAnalyzer';

export interface IdleDetectionConfig {
	postMessage: (message: any) => void;
	isProcessing: () => boolean;
	idleThresholdMs?: number;
	checkIntervalMs?: number;
}

export class IdleDetectionManager {
	private codeAnalyzer: CodeAnalyzer | undefined;
	private idleTimer: NodeJS.Timeout | undefined;
	private lastToolCallTime: number = 0;
	private suggestionShownThisIdle: boolean = false;
	private config: IdleDetectionConfig;
	private idleThresholdMs: number;
	private checkIntervalMs: number;

	constructor(config: IdleDetectionConfig) {
		this.config = config;
		this.idleThresholdMs = config.idleThresholdMs || 7000;
		this.checkIntervalMs = config.checkIntervalMs || 500;
	}

	/**
	 * Initialize code analyzer for a workspace
	 */
	initializeAnalyzer(workspacePath: string): void {
		if (!workspacePath) {
			console.log('[IdleDetectionManager] No workspace path - skipping analysis');
			return;
		}

		this.codeAnalyzer = new CodeAnalyzer(workspacePath);

		this.codeAnalyzer.onReady(() => {
			const count = this.codeAnalyzer?.getAllSuggestions().length || 0;
			console.log('[IdleDetectionManager] Suggestions ready:', count);
			this.config.postMessage({
				type: 'suggestionsReady',
				data: { count }
			});
		});

		// Delay analysis start
		setTimeout(() => {
			this.codeAnalyzer?.startBackgroundAnalysis();
		}, 5000);
	}

	/**
	 * Start idle detection timer
	 */
	start(): void {
		this.stop();
		this.lastToolCallTime = Date.now();
		this.suggestionShownThisIdle = false;

		this.idleTimer = setInterval(() => {
			if (this.config.isProcessing() &&
				this.codeAnalyzer?.hasResults() &&
				!this.suggestionShownThisIdle) {

				const idleTime = Date.now() - this.lastToolCallTime;
				if (idleTime >= this.idleThresholdMs) {
					this.showNextSuggestion();
					this.suggestionShownThisIdle = true;
				}
			}
		}, this.checkIntervalMs);
	}

	/**
	 * Stop idle detection timer
	 */
	stop(): void {
		if (this.idleTimer) {
			clearInterval(this.idleTimer);
			this.idleTimer = undefined;
		}
	}

	/**
	 * Reset idle timer (called on tool activity)
	 */
	resetTimer(): void {
		this.lastToolCallTime = Date.now();
		this.suggestionShownThisIdle = false;
	}

	/**
	 * Show next code suggestion
	 */
	showNextSuggestion(): void {
		if (!this.codeAnalyzer) {
			return;
		}

		const suggestion = this.codeAnalyzer.getNextSuggestion();
		if (!suggestion) {
			return;
		}

		const remaining = this.codeAnalyzer.getRemainingCount();

		this.config.postMessage({
			type: 'codeSuggestion',
			data: {
				title: suggestion.title,
				description: suggestion.description,
				priority: suggestion.priority,
				category: suggestion.category,
				remaining: remaining
			}
		});
	}

	/**
	 * Check if analyzer has results
	 */
	hasResults(): boolean {
		return this.codeAnalyzer?.hasResults() || false;
	}

	/**
	 * Get all suggestions
	 */
	getAllSuggestions(): CodeSuggestion[] {
		return this.codeAnalyzer?.getAllSuggestions() || [];
	}

	/**
	 * Dispose resources
	 */
	dispose(): void {
		this.stop();
		this.codeAnalyzer?.dispose();
	}
}
