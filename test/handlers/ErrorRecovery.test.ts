/**
 * Error Recovery Tests
 * Tests how the system handles errors and malformed data
 */

import * as assert from 'assert';
import { StreamParser } from '../../src/handlers/StreamParser';

suite('Error Recovery Tests', () => {

	suite('Malformed JSON Handling', () => {
		test('Should continue parsing after malformed JSON', () => {
			const results: string[] = [];
			const errors: string[] = [];

			const parser = new StreamParser({
				onTextDelta: (text: string) => { results.push(text); },
				onError: (error: string) => { errors.push(error); }
			});

			// Send valid, then malformed, then valid again
			parser.parseChunk('{"type":"text_delta","text":"before"}\n');
			parser.parseChunk('{"type":"text_delta","text":broken}\n'); // malformed
			parser.parseChunk('{"type":"text_delta","text":"after"}\n');

			// Parser should recover and continue parsing valid JSON
			assert.strictEqual(results.length, 2, 'Should have parsed 2 valid messages');
			assert.strictEqual(results[0], 'before');
			assert.strictEqual(results[1], 'after');
			// Note: StreamParser silently ignores malformed JSON rather than calling onError
		});

		test('Should handle truncated JSON gracefully', () => {
			const results: string[] = [];
			const errors: string[] = [];

			const parser = new StreamParser({
				onTextDelta: (text: string) => { results.push(text); },
				onError: (error: string) => { errors.push(error); }
			});

			// Truncated JSON followed by valid
			parser.parseChunk('{"type":"text_delta","text":"hello\n'); // truncated - no closing brace
			parser.parseChunk('{"type":"text_delta","text":"world"}\n');

			assert.strictEqual(results.length, 1);
			assert.strictEqual(results[0], 'world');
		});

		test('Should handle empty lines between JSON', () => {
			const results: string[] = [];

			const parser = new StreamParser({
				onTextDelta: (text: string) => { results.push(text); }
			});

			parser.parseChunk('{"type":"text_delta","text":"a"}\n\n\n{"type":"text_delta","text":"b"}\n');

			assert.strictEqual(results.length, 2);
		});

		test('Should handle non-JSON text gracefully', () => {
			const results: string[] = [];
			const errors: string[] = [];

			const parser = new StreamParser({
				onTextDelta: (text: string) => { results.push(text); },
				onError: (error: string) => { errors.push(error); }
			});

			parser.parseChunk('This is not JSON at all\n');
			parser.parseChunk('{"type":"text_delta","text":"valid"}\n');

			assert.strictEqual(results.length, 1);
			assert.strictEqual(results[0], 'valid');
		});
	});

	suite('Unknown Message Types', () => {
		test('Should ignore unknown message types without crashing', () => {
			const results: string[] = [];

			const parser = new StreamParser({
				onTextDelta: (text: string) => { results.push(text); }
			});

			parser.parseChunk('{"type":"unknown_future_type","data":"something"}\n');
			parser.parseChunk('{"type":"text_delta","text":"works"}\n');

			assert.strictEqual(results.length, 1);
			assert.strictEqual(results[0], 'works');
		});

		test('Should handle messages without type field', () => {
			const results: string[] = [];

			const parser = new StreamParser({
				onTextDelta: (text: string) => { results.push(text); }
			});

			parser.parseChunk('{"data":"no type field"}\n');
			parser.parseChunk('{"type":"text_delta","text":"valid"}\n');

			assert.strictEqual(results.length, 1);
		});
	});

	suite('Buffer Overflow Prevention', () => {
		test('Should handle very long lines', () => {
			const results: string[] = [];

			const parser = new StreamParser({
				onTextDelta: (text: string) => { results.push(text); }
			});

			// Create a very long text string
			const longText = 'x'.repeat(100000);
			parser.parseChunk(`{"type":"text_delta","text":"${longText}"}\n`);

			assert.strictEqual(results.length, 1);
			assert.strictEqual(results[0].length, 100000);
		});

		test('Should handle many small chunks', () => {
			const results: string[] = [];

			const parser = new StreamParser({
				onTextDelta: (text: string) => { results.push(text); }
			});

			// Send the JSON one character at a time
			const json = '{"type":"text_delta","text":"chunked"}\n';
			for (const char of json) {
				parser.parseChunk(char);
			}

			assert.strictEqual(results.length, 1);
			assert.strictEqual(results[0], 'chunked');
		});
	});

	suite('Callback Error Handling', () => {
		test('Should continue after callback throws', () => {
			const results: string[] = [];
			let callCount = 0;

			const parser = new StreamParser({
				onTextDelta: (text: string) => {
					callCount++;
					if (callCount === 1) {
						throw new Error('Callback error');
					}
					results.push(text);
				}
			});

			// First will throw, second should still work
			try {
				parser.parseChunk('{"type":"text_delta","text":"first"}\n');
			} catch {
				// Expected
			}
			parser.parseChunk('{"type":"text_delta","text":"second"}\n');

			assert.strictEqual(results.length, 1);
			assert.strictEqual(results[0], 'second');
		});
	});

	suite('Special Characters', () => {
		test('Should handle unicode characters', () => {
			const results: string[] = [];

			const parser = new StreamParser({
				onTextDelta: (text: string) => { results.push(text); }
			});

			parser.parseChunk('{"type":"text_delta","text":"Hello 世界 🌍"}\n');

			assert.strictEqual(results.length, 1);
			assert.strictEqual(results[0], 'Hello 世界 🌍');
		});

		test('Should handle escaped characters in JSON', () => {
			const results: string[] = [];

			const parser = new StreamParser({
				onTextDelta: (text: string) => { results.push(text); }
			});

			parser.parseChunk('{"type":"text_delta","text":"line1\\nline2\\ttabbed"}\n');

			assert.strictEqual(results.length, 1);
			assert.ok(results[0].includes('\n'));
			assert.ok(results[0].includes('\t'));
		});

		test('Should handle quotes in JSON strings', () => {
			const results: string[] = [];

			const parser = new StreamParser({
				onTextDelta: (text: string) => { results.push(text); }
			});

			parser.parseChunk('{"type":"text_delta","text":"He said \\"hello\\""}\n');

			assert.strictEqual(results.length, 1);
			assert.ok(results[0].includes('"'));
		});
	});

	suite('Rapid Stream Processing', () => {
		test('Should handle rapid successive chunks', () => {
			const results: string[] = [];

			const parser = new StreamParser({
				onTextDelta: (text: string) => { results.push(text); }
			});

			// Simulate rapid streaming
			for (let i = 0; i < 100; i++) {
				parser.parseChunk(`{"type":"text_delta","text":"msg${i}"}\n`);
			}

			assert.strictEqual(results.length, 100);
			assert.strictEqual(results[0], 'msg0');
			assert.strictEqual(results[99], 'msg99');
		});
	});
});
