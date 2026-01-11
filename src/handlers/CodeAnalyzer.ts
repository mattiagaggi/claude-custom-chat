/**
 * CodeAnalyzer.ts - Background Code Analysis
 *
 * Runs Claude Code in the background on extension startup to analyze
 * the codebase and suggest improvements. Results are displayed to the
 * user during idle periods (long waits with no tool activity).
 */

import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';

export interface CodeSuggestion {
	title: string;
	description: string;
	priority: 'high' | 'medium' | 'low';
	category: string;
}

export interface AnalysisResult {
	suggestions: CodeSuggestion[];
	analyzedAt: Date;
	workspacePath: string;
}

export class CodeAnalyzer {
	private analysisResult: AnalysisResult | null = null;
	private isAnalyzing = false;
	private analysisProcess: ChildProcess | null = null;
	private shownSuggestionIndices: Set<number> = new Set();
	private onReadyCallback: (() => void) | null = null;

	constructor(
		private workspacePath: string,
		private claudePath: string
	) {}

	/**
	 * Set callback to be called when suggestions are ready
	 */
	public onReady(callback: () => void): void {
		this.onReadyCallback = callback;
		// If already ready, call immediately
		if (this.hasResults()) {
			callback();
		}
	}

	/**
	 * Start background analysis of the codebase
	 * Returns immediately - analysis runs in background
	 */
	public startBackgroundAnalysis(): void {
		if (this.isAnalyzing) {
			console.log('[CodeAnalyzer] Analysis already in progress');
			return;
		}

		this.isAnalyzing = true;
		console.log('[CodeAnalyzer] Starting background code analysis...');

		const prompt = `Analyze this codebase thoroughly and provide exactly 100 actionable improvement suggestions. Focus on:
- Code quality and best practices
- Performance optimizations
- Security considerations
- Architecture improvements
- Code maintainability
- Error handling
- Testing coverage
- Documentation
- Accessibility
- Type safety

For each suggestion, provide:
1. A short title (max 10 words)
2. A brief description (1-2 sentences)
3. Priority (high/medium/low)
4. Category (quality/performance/security/architecture/maintainability/testing/documentation/accessibility/types)

Format your response as JSON array:
[{"title": "...", "description": "...", "priority": "high|medium|low", "category": "..."}]

Only output the JSON array, nothing else. Provide exactly 100 suggestions.`;

		const args = [
			'--print',
			'--output-format', 'json',
			'--max-turns', '1',
			prompt
		];

		try {
			this.analysisProcess = spawn(this.claudePath, args, {
				cwd: this.workspacePath,
				env: { ...process.env },
				stdio: ['pipe', 'pipe', 'pipe']
			});

			let stdout = '';
			let stderr = '';

			this.analysisProcess.stdout?.on('data', (data) => {
				stdout += data.toString();
			});

			this.analysisProcess.stderr?.on('data', (data) => {
				stderr += data.toString();
			});

			this.analysisProcess.on('close', (code) => {
				this.isAnalyzing = false;
				this.analysisProcess = null;

				if (code === 0) {
					this.parseAnalysisResult(stdout);
				} else {
					console.error('[CodeAnalyzer] Analysis failed with code:', code);
					console.error('[CodeAnalyzer] stderr:', stderr);
				}
			});

			this.analysisProcess.on('error', (error) => {
				this.isAnalyzing = false;
				this.analysisProcess = null;
				console.error('[CodeAnalyzer] Analysis process error:', error);
			});

			// Set a timeout to kill long-running analysis
			setTimeout(() => {
				if (this.analysisProcess && this.isAnalyzing) {
					console.log('[CodeAnalyzer] Analysis timeout - killing process');
					this.analysisProcess.kill();
					this.isAnalyzing = false;
				}
			}, 120000); // 2 minute timeout

		} catch (error) {
			this.isAnalyzing = false;
			console.error('[CodeAnalyzer] Failed to start analysis:', error);
		}
	}

	/**
	 * Parse the analysis result from Claude's output
	 */
	private parseAnalysisResult(output: string): void {
		try {
			// Try to extract JSON from the output
			// Claude's --print output might have extra text, so we need to find the JSON array
			const jsonMatch = output.match(/\[[\s\S]*?\]/);
			if (!jsonMatch) {
				// Try parsing line by line for JSON result
				const lines = output.split('\n');
				for (const line of lines) {
					try {
						const parsed = JSON.parse(line);
						if (parsed.result) {
							// Result message from Claude
							const resultMatch = parsed.result.match(/\[[\s\S]*?\]/);
							if (resultMatch) {
								const suggestions = JSON.parse(resultMatch[0]);
								this.storeResult(suggestions);
								return;
							}
						}
					} catch {
						// Not a JSON line, continue
					}
				}
				console.error('[CodeAnalyzer] Could not find JSON array in output');
				return;
			}

			const suggestions = JSON.parse(jsonMatch[0]);
			this.storeResult(suggestions);
		} catch (error) {
			console.error('[CodeAnalyzer] Failed to parse analysis result:', error);
			console.log('[CodeAnalyzer] Raw output:', output.substring(0, 500));
		}
	}

	/**
	 * Store validated analysis result
	 */
	private storeResult(suggestions: any[]): void {
		// Validate and normalize suggestions (keep all 100)
		const validSuggestions: CodeSuggestion[] = suggestions
			.filter(s => s.title && s.description)
			.slice(0, 100)
			.map(s => ({
				title: String(s.title).substring(0, 100),
				description: String(s.description).substring(0, 300),
				priority: ['high', 'medium', 'low'].includes(s.priority) ? s.priority : 'medium',
				category: String(s.category || 'general').substring(0, 50)
			}));

		if (validSuggestions.length > 0) {
			this.analysisResult = {
				suggestions: validSuggestions,
				analyzedAt: new Date(),
				workspacePath: this.workspacePath
			};
			console.log('[CodeAnalyzer] Analysis complete:', validSuggestions.length, 'suggestions');

			// Notify that suggestions are ready
			if (this.onReadyCallback) {
				this.onReadyCallback();
			}
		}
	}

	/**
	 * Check if analysis is complete and has results
	 */
	public hasResults(): boolean {
		return this.analysisResult !== null && this.analysisResult.suggestions.length > 0;
	}

	/**
	 * Check if analysis is currently running
	 */
	public isRunning(): boolean {
		return this.isAnalyzing;
	}

	/**
	 * Get the next unshown suggestion (cycles through all)
	 * Returns null if no suggestions available
	 */
	public getNextSuggestion(): CodeSuggestion | null {
		if (!this.analysisResult || this.analysisResult.suggestions.length === 0) {
			return null;
		}

		const suggestions = this.analysisResult.suggestions;

		// Find first unshown suggestion
		for (let i = 0; i < suggestions.length; i++) {
			if (!this.shownSuggestionIndices.has(i)) {
				this.shownSuggestionIndices.add(i);
				return suggestions[i];
			}
		}

		// All shown - reset and start over
		this.shownSuggestionIndices.clear();
		this.shownSuggestionIndices.add(0);
		return suggestions[0];
	}

	/**
	 * Get all suggestions
	 */
	public getAllSuggestions(): CodeSuggestion[] {
		return this.analysisResult?.suggestions || [];
	}

	/**
	 * Get count of remaining unshown suggestions
	 */
	public getRemainingCount(): number {
		if (!this.analysisResult) return 0;
		return this.analysisResult.suggestions.length - this.shownSuggestionIndices.size;
	}

	/**
	 * Reset shown state (e.g., on new session)
	 */
	public resetShownState(): void {
		this.shownSuggestionIndices.clear();
	}

	/**
	 * Stop any running analysis
	 */
	public dispose(): void {
		if (this.analysisProcess) {
			this.analysisProcess.kill();
			this.analysisProcess = null;
		}
		this.isAnalyzing = false;
	}
}
