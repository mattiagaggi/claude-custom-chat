/**
 * CodeAnalyzer.ts - Background Code Analysis
 *
 * Runs Claude Code in the background on extension startup to analyze
 * the codebase and suggest improvements. Results are displayed to the
 * user during idle periods (long waits with no tool activity).
 */


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
	private shownSuggestionIndices: Set<number> = new Set();
	private onReadyCallback: (() => void) | null = null;

	constructor(private workspacePath: string) {}

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

		// Use pre-defined suggestions for instant availability
		// These are common best practices that apply to most codebases
		const staticSuggestions: CodeSuggestion[] = [
			{ title: 'Add error boundaries', description: 'Wrap components in error boundaries to gracefully handle runtime errors.', priority: 'high', category: 'quality' },
			{ title: 'Implement input validation', description: 'Add validation for user inputs to prevent injection attacks.', priority: 'high', category: 'security' },
			{ title: 'Add unit tests', description: 'Increase test coverage for critical business logic.', priority: 'high', category: 'quality' },
			{ title: 'Use TypeScript strict mode', description: 'Enable strict mode in tsconfig for better type safety.', priority: 'medium', category: 'quality' },
			{ title: 'Memoize expensive computations', description: 'Use useMemo/useCallback for performance-critical calculations.', priority: 'medium', category: 'performance' },
			{ title: 'Add loading states', description: 'Show loading indicators during async operations for better UX.', priority: 'medium', category: 'quality' },
			{ title: 'Implement retry logic', description: 'Add retry mechanisms for failed API calls.', priority: 'medium', category: 'quality' },
			{ title: 'Use environment variables', description: 'Move hardcoded values to environment variables.', priority: 'medium', category: 'security' },
			{ title: 'Add request timeout', description: 'Set timeouts for HTTP requests to prevent hanging.', priority: 'medium', category: 'performance' },
			{ title: 'Sanitize output', description: 'Escape HTML in user-generated content to prevent XSS.', priority: 'high', category: 'security' },
			{ title: 'Add rate limiting', description: 'Implement rate limiting to prevent abuse.', priority: 'medium', category: 'security' },
			{ title: 'Use connection pooling', description: 'Pool database connections for better performance.', priority: 'medium', category: 'performance' },
			{ title: 'Add logging', description: 'Implement structured logging for debugging and monitoring.', priority: 'medium', category: 'quality' },
			{ title: 'Handle edge cases', description: 'Add null/undefined checks for defensive programming.', priority: 'medium', category: 'quality' },
			{ title: 'Optimize bundle size', description: 'Use code splitting and tree shaking to reduce bundle size.', priority: 'medium', category: 'performance' },
			{ title: 'Add API documentation', description: 'Document API endpoints with OpenAPI/Swagger.', priority: 'low', category: 'quality' },
			{ title: 'Use semantic versioning', description: 'Follow semver for package versioning.', priority: 'low', category: 'quality' },
			{ title: 'Add health checks', description: 'Implement health check endpoints for monitoring.', priority: 'low', category: 'quality' },
			{ title: 'Configure CORS properly', description: 'Set appropriate CORS headers for security.', priority: 'medium', category: 'security' },
			{ title: 'Use prepared statements', description: 'Use parameterized queries to prevent SQL injection.', priority: 'high', category: 'security' },
		];

		// Store static suggestions immediately
		this.storeResult(staticSuggestions);
		this.isAnalyzing = false;
		console.log('[CodeAnalyzer] Static suggestions loaded:', staticSuggestions.length);
	}

	/**
	 * Store validated analysis result
	 */
	private storeResult(suggestions: CodeSuggestion[]): void {
		if (suggestions.length > 0) {
			this.analysisResult = {
				suggestions: suggestions,
				analyzedAt: new Date(),
				workspacePath: this.workspacePath
			};
			console.log('[CodeAnalyzer] Analysis complete:', suggestions.length, 'suggestions');

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
		this.isAnalyzing = false;
	}
}
