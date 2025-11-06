import test from 'node:test';
import assert from 'node:assert';
import {NodeCache2} from './index.js';

test('set and get a value', () => {
	const cache = new NodeCache2();
	cache.set('foo', 'bar');
	assert.strictEqual(cache.get('foo'), 'bar');
});
