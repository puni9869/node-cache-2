# node-cache-2

`node-cache-2` is a small in-memory cache for Node.js that follows the familiar `node-cache` style API while shipping as a native ECMAScript module.

## Features

- Native ESM package with no CoffeeScript
- Per-key TTL support with optional default TTL
- Periodic expiration checks
- Deep cloning by default, with opt-out support
- Bulk `mset` and `mget` helpers
- Cache statistics and lifecycle events

## Installation

From GitHub Packages:

```bash
yarn add @puni9869/node-cache-2
```

If you are installing from GitHub Packages locally, authenticate npm/yarn against `npm.pkg.github.com` first:

```bash
echo "@puni9869:registry=https://npm.pkg.github.com" >> .npmrc
echo "//npm.pkg.github.com/:_authToken=YOUR_GITHUB_TOKEN" >> .npmrc
```

## Quick start

```js
import NodeCache from '@puni9869/node-cache-2';

const cache = new NodeCache({
	stdTTL: 60,
	checkperiod: 120,
	useClones: true,
});

cache.set('user:1', {name: 'Ada'});

console.log(cache.get('user:1'));
//=> { name: 'Ada' }

cache.on('expired', (key, value) => {
	console.log(`expired ${key}`, value);
});
```

## API

### Constructor

```js
const cache = new NodeCache(options);
```

Supported options:

- `stdTTL`: default TTL in seconds. `0` means no expiration.
- `checkperiod`: how often to scan for expired keys in seconds. `0` disables the timer.
- `useClones`: clone values on write and read. Defaults to `true`.
- `deleteOnExpire`: remove entries once they expire. Defaults to `true`.
- `maxKeys`: maximum live keys allowed. `-1` disables the limit.

### Methods

- `set(key, value, ttl?)`: store a value and return `true`.
- `mset(entries)`: store multiple values using `{key, val, ttl?}` objects.
- `get(key)`: get a value or `undefined`.
- `mget(keys)`: get multiple values as an object keyed by cache key.
- `del(key | keys)`: delete one key or many keys and return the number removed.
- `take(key)`: get a value and delete it in one call.
- `ttl(key, ttl?)`: update a key TTL. Pass `0` for no expiration, or a negative number to delete the key.
- `getTtl(key)`: get the expiration timestamp in milliseconds, `0` for non-expiring values, or `undefined` when the key is missing.
- `keys()`: list all live keys.
- `has(key)`: return `true` when a live key exists.
- `getStats()`: return cache stats in the shape `{hits, misses, keys, ksize, vsize}`.
- `flushAll()`: remove all entries and emit `flush`.
- `flushStats()`: reset hit and miss counters while keeping the current live size stats in sync.
- `close()`: stop the background expiration timer.

### Events

- `set(key, value)`: emitted when a value is written.
- `del(key, value)`: emitted when a value is explicitly removed.
- `expired(key, value)`: emitted when a key expires.
- `flush()`: emitted when the cache is cleared.

## Development

```bash
yarn install
yarn lint
yarn test
```

The package ships native ESM source directly from `src/index.js`, so there is no transpilation step.

## Publishing

The repository includes a GitHub Actions publish workflow that pushes the package to GitHub Packages.

Release flow:

1. Bump the version in `package.json`.
2. Commit and push to GitHub.
3. Create a GitHub release or run the `Publish Package` workflow manually.

The workflow publishes with `GITHUB_TOKEN`, so no separate npm token is required for GitHub Packages.
