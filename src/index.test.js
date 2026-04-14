import assert from 'node:assert/strict';
import test from 'node:test';
import {setTimeout as delay} from 'node:timers/promises';
import NodeCache, {NodeCache as NamedNodeCache, NodeCache2} from './index.js';

test('exports the cache as default and named aliases', () => {
	assert.strictEqual(NodeCache, NamedNodeCache);
	assert.strictEqual(NodeCache, NodeCache2);
});

test('sets and gets values', t => {
	const cache = new NodeCache({checkperiod: 0});
	t.after(() => cache.close());

	cache.set('foo', 'bar');

	assert.strictEqual(cache.get('foo'), 'bar');
	assert.strictEqual(cache.has('foo'), true);
	assert.deepStrictEqual(cache.keys(), ['foo']);
});

test('clones values by default', t => {
	const cache = new NodeCache({checkperiod: 0});
	t.after(() => cache.close());

	cache.set('profile', {name: 'Ada'});

	const firstRead = cache.get('profile');
	firstRead.name = 'Grace';

	assert.deepStrictEqual(cache.get('profile'), {name: 'Ada'});
});

test('can reuse object references when useClones is disabled', t => {
	const cache = new NodeCache({checkperiod: 0, useClones: false});
	t.after(() => cache.close());

	const profile = {name: 'Ada'};
	cache.set('profile', profile);
	profile.name = 'Grace';

	assert.deepStrictEqual(cache.get('profile'), {name: 'Grace'});
});

test('supports bulk set and get operations', t => {
	const cache = new NodeCache({checkperiod: 0});
	t.after(() => cache.close());

	cache.mset([
		{key: 'foo', val: 'bar'},
		{key: 'count', val: 2},
	]);

	assert.deepStrictEqual(
		{...cache.mget(['foo', 'count', 'missing'])},
		{foo: 'bar', count: 2},
	);
});

test('expires values with ttl and emits expired events', async t => {
	const cache = new NodeCache({checkperiod: 0});
	const expiredEntries = [];
	t.after(() => cache.close());

	cache.on('expired', (key, value) => {
		expiredEntries.push([key, value]);
	});

	cache.set('session', 'token', 0.02);
	await delay(40);

	assert.strictEqual(cache.get('session'), undefined);
	assert.deepStrictEqual(expiredEntries, [['session', 'token']]);
	assert.deepStrictEqual(cache.getStats(), {
		hits: 0,
		misses: 1,
		keys: 0,
		ksize: 0,
		vsize: 0,
	});
});

test('can keep expired entries internally when deleteOnExpire is false', async t => {
	const cache = new NodeCache({checkperiod: 0, deleteOnExpire: false});
	t.after(() => cache.close());

	cache.set('session', 'token', 0.02);
	await delay(40);

	assert.strictEqual(cache.get('session'), undefined);
	assert.strictEqual(cache.has('session'), false);
	assert.strictEqual(cache.data.has('session'), true);
	assert.deepStrictEqual(cache.keys(), []);
	assert.strictEqual(cache.del('session'), 1);
});

test('supports take, ttl updates, and getTtl', t => {
	const cache = new NodeCache({checkperiod: 0});
	t.after(() => cache.close());

	cache.set('session', 'token', 10);
	const ttlBefore = cache.getTtl('session');

	assert.equal(typeof ttlBefore, 'number');
	assert.strictEqual(cache.ttl('session', 0), true);
	assert.strictEqual(cache.getTtl('session'), 0);
	assert.strictEqual(cache.take('session'), 'token');
	assert.strictEqual(cache.get('session'), undefined);
});

test('enforces maxKeys for new entries', t => {
	const cache = new NodeCache({checkperiod: 0, maxKeys: 1});
	t.after(() => cache.close());

	cache.set('foo', 'bar');

	assert.throws(() => {
		cache.set('bar', 'baz');
	}, /maxKeys/);

	assert.strictEqual(cache.set('foo', 'baz'), true);
	assert.strictEqual(cache.get('foo'), 'baz');
});

test('tracks statistics and supports flushing data and counters', t => {
	const cache = new NodeCache({checkperiod: 0});
	t.after(() => cache.close());

	cache.set('foo', 'bar');
	cache.get('foo');
	cache.get('missing');

	assert.deepStrictEqual(cache.getStats(), {
		hits: 1,
		misses: 1,
		keys: 1,
		ksize: 3,
		vsize: 3,
	});

	cache.flushStats();

	assert.deepStrictEqual(cache.getStats(), {
		hits: 0,
		misses: 0,
		keys: 1,
		ksize: 3,
		vsize: 3,
	});

	cache.flushAll();

	assert.deepStrictEqual(cache.getStats(), {
		hits: 0,
		misses: 0,
		keys: 0,
		ksize: 0,
		vsize: 0,
	});
});
