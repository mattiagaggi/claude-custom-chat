/**
 * PathConverter Unit Tests
 * Tests Windows to WSL path conversion
 */

import * as assert from 'assert';
import { convertToWSLPath } from '../../src/utils/PathConverter';

suite('PathConverter Tests', () => {

	suite('Windows to WSL Conversion', () => {
		test('Should convert C: drive path to WSL format', () => {
			const result = convertToWSLPath('C:\\Users\\test\\project', true);
			assert.strictEqual(result, '/mnt/c/users/test/project');
		});

		test('Should convert D: drive path to WSL format', () => {
			const result = convertToWSLPath('D:\\Projects\\app', true);
			assert.strictEqual(result, '/mnt/d/projects/app');
		});

		test('Should handle lowercase drive letters', () => {
			const result = convertToWSLPath('c:\\Users\\test', true);
			assert.strictEqual(result, '/mnt/c/users/test');
		});

		test('Should convert backslashes to forward slashes', () => {
			const result = convertToWSLPath('C:\\a\\b\\c\\d', true);
			assert.strictEqual(result, '/mnt/c/a/b/c/d');
		});

		test('Should not convert when WSL is disabled', () => {
			const result = convertToWSLPath('C:\\Users\\test', false);
			assert.strictEqual(result, 'C:\\Users\\test');
		});

		test('Should not convert Unix paths even with WSL enabled', () => {
			const result = convertToWSLPath('/home/user/project', true);
			assert.strictEqual(result, '/home/user/project');
		});

		test('Should handle paths with spaces', () => {
			const result = convertToWSLPath('C:\\Program Files\\App', true);
			assert.strictEqual(result, '/mnt/c/program files/app');
		});

		test('Should handle root drive path', () => {
			const result = convertToWSLPath('C:\\', true);
			assert.strictEqual(result, '/mnt/c/');
		});
	});

	suite('Edge Cases', () => {
		test('Should handle empty string', () => {
			const result = convertToWSLPath('', true);
			assert.strictEqual(result, '');
		});

		test('Should handle relative paths', () => {
			const result = convertToWSLPath('src\\index.ts', true);
			assert.strictEqual(result, 'src\\index.ts');
		});

		test('Should handle UNC paths (not converted)', () => {
			const result = convertToWSLPath('\\\\server\\share\\file', true);
			assert.strictEqual(result, '\\\\server\\share\\file');
		});
	});
});
