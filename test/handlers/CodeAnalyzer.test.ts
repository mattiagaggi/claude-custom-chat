/**
 * CodeAnalyzer Unit Tests
 * Tests background code analysis and suggestion management
 */

import * as assert from 'assert';
import { CodeAnalyzer, CodeSuggestion } from '../../src/handlers/CodeAnalyzer';

suite('CodeAnalyzer Tests', () => {

	suite('Constructor and Initialization', () => {
		test('Should create analyzer with workspace path', () => {
			const analyzer = new CodeAnalyzer('/path/to/workspace');

			assert.ok(analyzer);
		});

		test('Should not have results before analysis', () => {
			const analyzer = new CodeAnalyzer('/path/to/workspace');

			assert.strictEqual(analyzer.hasResults(), false);
		});

		test('Should not be running before analysis starts', () => {
			const analyzer = new CodeAnalyzer('/path/to/workspace');

			assert.strictEqual(analyzer.isRunning(), false);
		});

		test('Should return empty suggestions before analysis', () => {
			const analyzer = new CodeAnalyzer('/path/to/workspace');

			const suggestions = analyzer.getAllSuggestions();
			assert.deepStrictEqual(suggestions, []);
		});

		test('Should return null for next suggestion before analysis', () => {
			const analyzer = new CodeAnalyzer('/path/to/workspace');

			const suggestion = analyzer.getNextSuggestion();
			assert.strictEqual(suggestion, null);
		});

		test('Should return 0 remaining count before analysis', () => {
			const analyzer = new CodeAnalyzer('/path/to/workspace');

			assert.strictEqual(analyzer.getRemainingCount(), 0);
		});
	});

	suite('startBackgroundAnalysis', () => {
		test('Should populate suggestions after analysis starts', () => {
			const analyzer = new CodeAnalyzer('/path/to/workspace');

			analyzer.startBackgroundAnalysis();

			assert.strictEqual(analyzer.hasResults(), true);
			assert.ok(analyzer.getAllSuggestions().length > 0);
		});

		test('Should not be running after analysis completes (sync)', () => {
			const analyzer = new CodeAnalyzer('/path/to/workspace');

			analyzer.startBackgroundAnalysis();

			// Since it's synchronous with static suggestions
			assert.strictEqual(analyzer.isRunning(), false);
		});

		test('Should not restart if already analyzing', () => {
			const analyzer = new CodeAnalyzer('/path/to/workspace');

			analyzer.startBackgroundAnalysis();
			const suggestionsCount = analyzer.getAllSuggestions().length;

			analyzer.startBackgroundAnalysis(); // Call again

			// Should have same number of suggestions
			assert.strictEqual(analyzer.getAllSuggestions().length, suggestionsCount);
		});

		test('Should include suggestions from different categories', () => {
			const analyzer = new CodeAnalyzer('/path/to/workspace');

			analyzer.startBackgroundAnalysis();

			const suggestions = analyzer.getAllSuggestions();
			const categories = new Set(suggestions.map(s => s.category));

			assert.ok(categories.has('quality'));
			assert.ok(categories.has('security'));
			assert.ok(categories.has('performance'));
		});

		test('Should include suggestions with different priorities', () => {
			const analyzer = new CodeAnalyzer('/path/to/workspace');

			analyzer.startBackgroundAnalysis();

			const suggestions = analyzer.getAllSuggestions();
			const priorities = new Set(suggestions.map(s => s.priority));

			assert.ok(priorities.has('high'));
			assert.ok(priorities.has('medium'));
			assert.ok(priorities.has('low'));
		});
	});

	suite('onReady callback', () => {
		test('Should call onReady callback when suggestions are ready', () => {
			const analyzer = new CodeAnalyzer('/path/to/workspace');
			let callbackCalled = false;

			analyzer.onReady(() => {
				callbackCalled = true;
			});

			analyzer.startBackgroundAnalysis();

			assert.strictEqual(callbackCalled, true);
		});

		test('Should call onReady immediately if already has results', () => {
			const analyzer = new CodeAnalyzer('/path/to/workspace');
			analyzer.startBackgroundAnalysis();

			let callbackCalled = false;
			analyzer.onReady(() => {
				callbackCalled = true;
			});

			assert.strictEqual(callbackCalled, true);
		});

		test('Should not call onReady if set before analysis and no results', () => {
			const analyzer = new CodeAnalyzer('/path/to/workspace');
			let callbackCalled = false;

			analyzer.onReady(() => {
				callbackCalled = true;
			});

			// Don't start analysis
			assert.strictEqual(callbackCalled, false);
		});
	});

	suite('getNextSuggestion', () => {
		test('Should return suggestions one by one', () => {
			const analyzer = new CodeAnalyzer('/path/to/workspace');
			analyzer.startBackgroundAnalysis();

			const suggestion1 = analyzer.getNextSuggestion();
			const suggestion2 = analyzer.getNextSuggestion();

			assert.ok(suggestion1);
			assert.ok(suggestion2);
			assert.notDeepStrictEqual(suggestion1, suggestion2);
		});

		test('Should track shown suggestions', () => {
			const analyzer = new CodeAnalyzer('/path/to/workspace');
			analyzer.startBackgroundAnalysis();

			const totalCount = analyzer.getAllSuggestions().length;

			analyzer.getNextSuggestion();
			assert.strictEqual(analyzer.getRemainingCount(), totalCount - 1);

			analyzer.getNextSuggestion();
			assert.strictEqual(analyzer.getRemainingCount(), totalCount - 2);
		});

		test('Should cycle through all suggestions and start over', () => {
			const analyzer = new CodeAnalyzer('/path/to/workspace');
			analyzer.startBackgroundAnalysis();

			const total = analyzer.getAllSuggestions().length;
			const firstSuggestion = analyzer.getNextSuggestion();

			// Get all remaining suggestions
			for (let i = 1; i < total; i++) {
				analyzer.getNextSuggestion();
			}

			// Next one should be the first again (cycles)
			const cycledSuggestion = analyzer.getNextSuggestion();
			assert.deepStrictEqual(cycledSuggestion, firstSuggestion);
		});

		test('Should return all unique suggestions before cycling', () => {
			const analyzer = new CodeAnalyzer('/path/to/workspace');
			analyzer.startBackgroundAnalysis();

			const total = analyzer.getAllSuggestions().length;
			const seenTitles = new Set<string>();

			for (let i = 0; i < total; i++) {
				const suggestion = analyzer.getNextSuggestion();
				assert.ok(suggestion);
				assert.ok(!seenTitles.has(suggestion!.title), `Duplicate suggestion: ${suggestion!.title}`);
				seenTitles.add(suggestion!.title);
			}

			assert.strictEqual(seenTitles.size, total);
		});
	});

	suite('getRemainingCount', () => {
		test('Should start at total count', () => {
			const analyzer = new CodeAnalyzer('/path/to/workspace');
			analyzer.startBackgroundAnalysis();

			const total = analyzer.getAllSuggestions().length;
			assert.strictEqual(analyzer.getRemainingCount(), total);
		});

		test('Should decrement as suggestions are shown', () => {
			const analyzer = new CodeAnalyzer('/path/to/workspace');
			analyzer.startBackgroundAnalysis();

			const total = analyzer.getAllSuggestions().length;

			analyzer.getNextSuggestion();
			analyzer.getNextSuggestion();
			analyzer.getNextSuggestion();

			assert.strictEqual(analyzer.getRemainingCount(), total - 3);
		});

		test('Should reset after full cycle', () => {
			const analyzer = new CodeAnalyzer('/path/to/workspace');
			analyzer.startBackgroundAnalysis();

			const total = analyzer.getAllSuggestions().length;

			// Go through all suggestions
			for (let i = 0; i < total; i++) {
				analyzer.getNextSuggestion();
			}
			assert.strictEqual(analyzer.getRemainingCount(), 0);

			// Get one more (triggers reset)
			analyzer.getNextSuggestion();
			assert.strictEqual(analyzer.getRemainingCount(), total - 1);
		});
	});

	suite('getAllSuggestions', () => {
		test('Should return all suggestions', () => {
			const analyzer = new CodeAnalyzer('/path/to/workspace');
			analyzer.startBackgroundAnalysis();

			const suggestions = analyzer.getAllSuggestions();

			assert.ok(Array.isArray(suggestions));
			assert.ok(suggestions.length > 0);
		});

		test('Should return suggestions with correct structure', () => {
			const analyzer = new CodeAnalyzer('/path/to/workspace');
			analyzer.startBackgroundAnalysis();

			const suggestions = analyzer.getAllSuggestions();

			for (const suggestion of suggestions) {
				assert.ok(typeof suggestion.title === 'string');
				assert.ok(typeof suggestion.description === 'string');
				assert.ok(['high', 'medium', 'low'].includes(suggestion.priority));
				assert.ok(typeof suggestion.category === 'string');
			}
		});

		test('Should not mutate internal state when accessing', () => {
			const analyzer = new CodeAnalyzer('/path/to/workspace');
			analyzer.startBackgroundAnalysis();

			const suggestions1 = analyzer.getAllSuggestions();
			const suggestions2 = analyzer.getAllSuggestions();

			assert.strictEqual(suggestions1.length, suggestions2.length);
		});
	});

	suite('resetShownState', () => {
		test('Should reset shown state', () => {
			const analyzer = new CodeAnalyzer('/path/to/workspace');
			analyzer.startBackgroundAnalysis();

			const total = analyzer.getAllSuggestions().length;

			// Show some suggestions
			analyzer.getNextSuggestion();
			analyzer.getNextSuggestion();
			analyzer.getNextSuggestion();

			assert.strictEqual(analyzer.getRemainingCount(), total - 3);

			// Reset
			analyzer.resetShownState();

			assert.strictEqual(analyzer.getRemainingCount(), total);
		});

		test('Should return first suggestion again after reset', () => {
			const analyzer = new CodeAnalyzer('/path/to/workspace');
			analyzer.startBackgroundAnalysis();

			const firstSuggestion = analyzer.getNextSuggestion();
			analyzer.getNextSuggestion();
			analyzer.getNextSuggestion();

			analyzer.resetShownState();

			const afterReset = analyzer.getNextSuggestion();
			assert.deepStrictEqual(afterReset, firstSuggestion);
		});
	});

	suite('dispose', () => {
		test('Should stop analyzing', () => {
			const analyzer = new CodeAnalyzer('/path/to/workspace');

			analyzer.dispose();

			assert.strictEqual(analyzer.isRunning(), false);
		});

		test('Should be safe to call multiple times', () => {
			const analyzer = new CodeAnalyzer('/path/to/workspace');

			analyzer.dispose();
			analyzer.dispose();
			analyzer.dispose();

			// Should not throw
			assert.ok(true);
		});

		test('Should preserve existing results', () => {
			const analyzer = new CodeAnalyzer('/path/to/workspace');
			analyzer.startBackgroundAnalysis();

			const beforeDispose = analyzer.getAllSuggestions().length;

			analyzer.dispose();

			// Results should still be accessible
			assert.strictEqual(analyzer.getAllSuggestions().length, beforeDispose);
		});
	});

	suite('Suggestion Content', () => {
		test('Should have non-empty titles', () => {
			const analyzer = new CodeAnalyzer('/path/to/workspace');
			analyzer.startBackgroundAnalysis();

			for (const suggestion of analyzer.getAllSuggestions()) {
				assert.ok(suggestion.title.length > 0);
			}
		});

		test('Should have non-empty descriptions', () => {
			const analyzer = new CodeAnalyzer('/path/to/workspace');
			analyzer.startBackgroundAnalysis();

			for (const suggestion of analyzer.getAllSuggestions()) {
				assert.ok(suggestion.description.length > 0);
			}
		});

		test('Should include security suggestions', () => {
			const analyzer = new CodeAnalyzer('/path/to/workspace');
			analyzer.startBackgroundAnalysis();

			const securitySuggestions = analyzer.getAllSuggestions()
				.filter(s => s.category === 'security');

			assert.ok(securitySuggestions.length > 0);
		});

		test('Should include performance suggestions', () => {
			const analyzer = new CodeAnalyzer('/path/to/workspace');
			analyzer.startBackgroundAnalysis();

			const perfSuggestions = analyzer.getAllSuggestions()
				.filter(s => s.category === 'performance');

			assert.ok(perfSuggestions.length > 0);
		});

		test('Should include quality suggestions', () => {
			const analyzer = new CodeAnalyzer('/path/to/workspace');
			analyzer.startBackgroundAnalysis();

			const qualitySuggestions = analyzer.getAllSuggestions()
				.filter(s => s.category === 'quality');

			assert.ok(qualitySuggestions.length > 0);
		});

		test('Should include high priority suggestions', () => {
			const analyzer = new CodeAnalyzer('/path/to/workspace');
			analyzer.startBackgroundAnalysis();

			const highPriority = analyzer.getAllSuggestions()
				.filter(s => s.priority === 'high');

			assert.ok(highPriority.length > 0);
		});
	});

	suite('hasResults', () => {
		test('Should return false before analysis', () => {
			const analyzer = new CodeAnalyzer('/path/to/workspace');

			assert.strictEqual(analyzer.hasResults(), false);
		});

		test('Should return true after analysis', () => {
			const analyzer = new CodeAnalyzer('/path/to/workspace');
			analyzer.startBackgroundAnalysis();

			assert.strictEqual(analyzer.hasResults(), true);
		});

		test('Should remain true after dispose', () => {
			const analyzer = new CodeAnalyzer('/path/to/workspace');
			analyzer.startBackgroundAnalysis();
			analyzer.dispose();

			assert.strictEqual(analyzer.hasResults(), true);
		});
	});

	suite('Multiple Instances', () => {
		test('Should work independently', () => {
			const analyzer1 = new CodeAnalyzer('/path/one');
			const analyzer2 = new CodeAnalyzer('/path/two');

			analyzer1.startBackgroundAnalysis();

			// analyzer2 should not have results
			assert.strictEqual(analyzer1.hasResults(), true);
			assert.strictEqual(analyzer2.hasResults(), false);
		});

		test('Should track shown state independently', () => {
			const analyzer1 = new CodeAnalyzer('/path/one');
			const analyzer2 = new CodeAnalyzer('/path/two');

			analyzer1.startBackgroundAnalysis();
			analyzer2.startBackgroundAnalysis();

			const total = analyzer1.getAllSuggestions().length;

			analyzer1.getNextSuggestion();
			analyzer1.getNextSuggestion();

			assert.strictEqual(analyzer1.getRemainingCount(), total - 2);
			assert.strictEqual(analyzer2.getRemainingCount(), total);
		});
	});
});
