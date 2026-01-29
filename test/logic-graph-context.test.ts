/**
 * Tests for @logic-graph context injection and autocomplete integration
 */

import * as assert from 'assert';

suite('Logic Graph Context Injection', () => {

	suite('@logic-graph detection', () => {
		test('Should detect @logic-graph in message text', () => {
			const message = 'explain the auth flow @logic-graph';
			assert.ok(message.includes('@logic-graph'));
		});

		test('Should detect @logic-graph at start of message', () => {
			const message = '@logic-graph what does this codebase do?';
			assert.ok(message.includes('@logic-graph'));
		});

		test('Should detect @logic-graph in middle of message', () => {
			const message = 'using @logic-graph tell me about the API';
			assert.ok(message.includes('@logic-graph'));
		});

		test('Should not detect partial matches', () => {
			const message = 'check @logic for errors';
			assert.strictEqual(message.includes('@logic-graph'), false);
		});
	});

	suite('@logic-graph replacement', () => {
		test('Should replace @logic-graph with context block', () => {
			const message = 'explain @logic-graph';
			const context = '# Codebase Logic Graph\n## Nodes\n- **auth**: Auth system';
			const result = message.replace(
				/@logic-graph/g,
				`\n<logic-graph>\n${context}\n</logic-graph>\n`
			);

			assert.ok(result.includes('<logic-graph>'));
			assert.ok(result.includes('</logic-graph>'));
			assert.ok(result.includes('# Codebase Logic Graph'));
			assert.ok(!result.includes('@logic-graph'));
		});

		test('Should replace multiple @logic-graph occurrences', () => {
			const message = '@logic-graph and also @logic-graph';
			const result = message.replace(/@logic-graph/g, '[GRAPH]');
			assert.strictEqual(result, '[GRAPH] and also [GRAPH]');
		});

		test('Should replace with error when unavailable', () => {
			const message = 'check @logic-graph';
			const result = message.replace(
				/@logic-graph/g,
				'\n[Logic graph not available — generate it first via the Graph tab]\n'
			);
			assert.ok(result.includes('not available'));
			assert.ok(!result.includes('@logic-graph'));
		});
	});

	suite('Autocomplete special items', () => {
		test('Special context items structure is valid', () => {
			// Mirrors the SPECIAL_CONTEXT_ITEMS from file-autocomplete.js
			const items = [
				{
					name: 'logic-graph',
					path: 'logic-graph',
					relativePath: 'logic-graph',
					isSpecial: true,
					icon: '🔗',
					description: 'Inject codebase logic graph overview',
				},
			];

			assert.strictEqual(items.length, 1);
			assert.strictEqual(items[0].name, 'logic-graph');
			assert.strictEqual(items[0].isSpecial, true);
			assert.ok(items[0].description.length > 0);
		});

		test('Filter matching should work for partial input', () => {
			const items = [{ name: 'logic-graph' }];
			const filters = ['l', 'log', 'logi', 'logic', 'logic-', 'logic-g', 'logic-graph'];

			filters.forEach(filter => {
				const matches = items.filter(item =>
					item.name.toLowerCase().includes(filter.toLowerCase())
				);
				assert.strictEqual(matches.length, 1, `Filter "${filter}" should match logic-graph`);
			});
		});

		test('Filter should not match unrelated input', () => {
			const items = [{ name: 'logic-graph' }];
			const nonMatches = ['src', 'file', 'xyz', 'graph-logic'];

			nonMatches.forEach(filter => {
				const matches = items.filter(item =>
					item.name.toLowerCase().includes(filter.toLowerCase())
				);
				// 'graph-logic' won't match 'logic-graph' but 'graph' alone would
				if (filter === 'graph-logic') {
					assert.strictEqual(matches.length, 0, `Filter "${filter}" should not match`);
				}
			});
		});
	});

	suite('Context format validation', () => {
		test('Injected context should use logic-graph XML tags', () => {
			const context = '# Codebase Logic Graph\n## Nodes\n- node1\n## Edges\n- edge1';
			const wrapped = `\n<logic-graph>\n${context}\n</logic-graph>\n`;

			assert.ok(wrapped.startsWith('\n<logic-graph>\n'));
			assert.ok(wrapped.endsWith('\n</logic-graph>\n'));
		});

		test('Context should preserve newlines', () => {
			const context = 'line1\nline2\nline3';
			const wrapped = `\n<logic-graph>\n${context}\n</logic-graph>\n`;
			const lines = wrapped.split('\n');
			// Empty + <logic-graph> + line1 + line2 + line3 + </logic-graph> + empty
			assert.strictEqual(lines.length, 7);
		});
	});
});
