import {EventEmitter} from 'node:events';
import {Buffer} from 'node:buffer';

const DEFAULT_OPTIONS = {
	stdTTL: 0,
	checkperiod: 600,
	useClones: true,
	deleteOnExpire: true,
	maxKeys: -1,
};

const createStats = () => ({
	hits: 0,
	misses: 0,
	keys: 0,
	ksize: 0,
	vsize: 0,
});

const isValidKey = key => typeof key === 'string' || typeof key === 'number';

const assertValidKey = key => {
	if (!isValidKey(key)) {
		throw new TypeError('Cache keys must be a string or number');
	}
};

const assertFiniteNumber = (value, label, {allowNegativeOne = false} = {}) => {
	if (allowNegativeOne && value === -1) {
		return;
	}

	if (!Number.isFinite(value) || value < 0) {
		throw new TypeError(`${label} must be a non-negative finite number`);
	}
};

const cloneValue = (value, useClones) => {
	if (!useClones) {
		return value;
	}

	try {
		return structuredClone(value);
	} catch {
		return value;
	}
};

const estimateSize = value => {
	if (typeof value === 'string') {
		return Buffer.byteLength(value, 'utf8');
	}

	if (
		typeof value === 'number'
		|| typeof value === 'boolean'
		|| typeof value === 'bigint'
		|| value === null
		|| value === undefined
	) {
		return Buffer.byteLength(String(value), 'utf8');
	}

	try {
		return Buffer.byteLength(JSON.stringify(value), 'utf8');
	} catch {
		return Buffer.byteLength(Object.prototype.toString.call(value), 'utf8');
	}
};

const normalizeTTL = (ttl, fallbackTTL) => {
	const resolvedTTL = ttl === undefined ? fallbackTTL : ttl;

	if (!Number.isFinite(resolvedTTL) || resolvedTTL < 0) {
		throw new TypeError('TTL must be a non-negative finite number');
	}

	return resolvedTTL;
};

const createEntry = (value, ttl, useClones) => ({
	value: cloneValue(value, useClones),
	expiresAt: ttl === 0 ? 0 : Date.now() + (ttl * 1000),
	expired: false,
});

class NodeCache extends EventEmitter {
	constructor(options = {}) {
		super();

		this.options = {
			...DEFAULT_OPTIONS,
			...options,
		};

		assertFiniteNumber(this.options.stdTTL, 'stdTTL');
		assertFiniteNumber(this.options.checkperiod, 'checkperiod');
		assertFiniteNumber(this.options.maxKeys, 'maxKeys', {allowNegativeOne: true});

		if (typeof this.options.useClones !== 'boolean') {
			throw new TypeError('useClones must be a boolean');
		}

		if (typeof this.options.deleteOnExpire !== 'boolean') {
			throw new TypeError('deleteOnExpire must be a boolean');
		}

		this.data = new Map();
		this.stats = createStats();
		this._checkTimer = undefined;

		this._syncStats();
		this._startCheckTimer();
	}

	set(key, value, ttl) {
		assertValidKey(key);
		this._sweepExpiredEntries();
		this._syncStats();

		const isReplacingLiveEntry = this._isLiveEntry(this.data.get(key));

		if (
			!isReplacingLiveEntry
			&& this.options.maxKeys > -1
			&& this.stats.keys >= this.options.maxKeys
		) {
			throw new Error(`Cache has reached the configured maxKeys limit of ${this.options.maxKeys}`);
		}

		const resolvedTTL = normalizeTTL(ttl, this.options.stdTTL);
		this.data.set(key, createEntry(value, resolvedTTL, this.options.useClones));
		this._syncStats();
		this.emit('set', key, this._wrap(this.data.get(key).value));

		return true;
	}

	mset(entries) {
		if (!Array.isArray(entries)) {
			throw new TypeError('mset expects an array of {key, val, ttl?} objects');
		}

		this._sweepExpiredEntries();
		this._syncStats();
		let nextLiveKeyCount = this.stats.keys;
		const seenKeys = new Set();

		for (const entry of entries) {
			if (!entry || typeof entry !== 'object' || !('key' in entry) || !('val' in entry)) {
				throw new TypeError('Each mset entry must include key and val properties');
			}

			assertValidKey(entry.key);
			normalizeTTL(entry.ttl, this.options.stdTTL);

			const isReplacingLiveEntry = this._isLiveEntry(this.data.get(entry.key));
			const isRepeatedKey = seenKeys.has(entry.key);

			if (
				!isReplacingLiveEntry
				&& !isRepeatedKey
				&& this.options.maxKeys > -1
				&& nextLiveKeyCount >= this.options.maxKeys
			) {
				throw new Error(`Cache has reached the configured maxKeys limit of ${this.options.maxKeys}`);
			}

			if (!isReplacingLiveEntry && !isRepeatedKey) {
				nextLiveKeyCount += 1;
			}

			seenKeys.add(entry.key);
		}

		for (const entry of entries) {
			this.data.set(
				entry.key,
				createEntry(
					entry.val,
					normalizeTTL(entry.ttl, this.options.stdTTL),
					this.options.useClones,
				),
			);
		}

		this._syncStats();
		return true;
	}

	get(key) {
		assertValidKey(key);
		const entry = this._getLiveEntry(key);

		if (!entry) {
			this.stats.misses += 1;
			return undefined;
		}

		this.stats.hits += 1;
		return this._wrap(entry.value);
	}

	mget(keys) {
		if (!Array.isArray(keys)) {
			throw new TypeError('mget expects an array of keys');
		}

		const values = Object.create(null);

		for (const key of keys) {
			assertValidKey(key);
			const entry = this._getLiveEntry(key);

			if (!entry) {
				this.stats.misses += 1;
				continue;
			}

			this.stats.hits += 1;
			values[key] = this._wrap(entry.value);
		}

		return values;
	}

	del(keys) {
		const keysToDelete = Array.isArray(keys) ? keys : [keys];
		let deletedKeys = 0;

		for (const key of keysToDelete) {
			assertValidKey(key);
			const entry = this.data.get(key);

			if (!entry) {
				continue;
			}

			this.data.delete(key);
			deletedKeys += 1;

			if (!entry.expired) {
				this.emit('del', key, this._wrap(entry.value));
			}
		}

		this._syncStats();
		return deletedKeys;
	}

	take(key) {
		assertValidKey(key);
		const entry = this._getLiveEntry(key);

		if (!entry) {
			this.stats.misses += 1;
			return undefined;
		}

		const value = this._wrap(entry.value);
		this.stats.hits += 1;
		this.data.delete(key);
		this._syncStats();
		this.emit('del', key, this._wrap(entry.value));

		return value;
	}

	ttl(key, ttl = this.options.stdTTL) {
		assertValidKey(key);
		const entry = this._getLiveEntry(key);

		if (!entry) {
			return false;
		}

		if (!Number.isFinite(ttl)) {
			throw new TypeError('TTL must be a finite number');
		}

		if (ttl < 0) {
			this.del(key);
			return true;
		}

		entry.expiresAt = ttl === 0 ? 0 : Date.now() + (ttl * 1000);
		entry.expired = false;
		this._syncStats();
		return true;
	}

	getTtl(key) {
		assertValidKey(key);
		const entry = this._getLiveEntry(key);

		if (!entry) {
			return undefined;
		}

		return entry.expiresAt;
	}

	keys() {
		this._sweepExpiredEntries();
		this._syncStats();
		return [...this.data.entries()]
			.filter(([, entry]) => this._isLiveEntry(entry))
			.map(([key]) => key);
	}

	has(key) {
		assertValidKey(key);
		return Boolean(this._getLiveEntry(key));
	}

	getStats() {
		this._sweepExpiredEntries();
		this._syncStats();

		return {...this.stats};
	}

	flushAll() {
		this.data.clear();
		this._syncStats();
		this.emit('flush');
	}

	flushStats() {
		this.stats.hits = 0;
		this.stats.misses = 0;
		this._syncStats();
	}

	close() {
		if (this._checkTimer) {
			clearInterval(this._checkTimer);
			this._checkTimer = undefined;
		}
	}

	_wrap(value) {
		return cloneValue(value, this.options.useClones);
	}

	_isLiveEntry(entry) {
		if (!entry || entry.expired) {
			return false;
		}

		return entry.expiresAt === 0 || entry.expiresAt > Date.now();
	}

	_getLiveEntry(key) {
		const entry = this.data.get(key);

		if (!entry) {
			return undefined;
		}

		if (entry.expired) {
			return undefined;
		}

		if (this._isEntryExpired(entry)) {
			this._expireEntry(key, entry);
			this._syncStats();
			return undefined;
		}

		return entry;
	}

	_isEntryExpired(entry) {
		if (!entry || entry.expired || entry.expiresAt === 0) {
			return false;
		}

		return entry.expiresAt <= Date.now();
	}

	_expireEntry(key, entry) {
		if (!entry || entry.expired) {
			return;
		}

		entry.expired = true;

		if (this.options.deleteOnExpire) {
			this.data.delete(key);
		}

		this.emit('expired', key, this._wrap(entry.value));
	}

	_sweepExpiredEntries() {
		for (const [key, entry] of this.data.entries()) {
			if (this._isEntryExpired(entry)) {
				this._expireEntry(key, entry);
			}
		}
	}

	_syncStats() {
		let liveKeys = 0;
		let keySize = 0;
		let valueSize = 0;

		for (const [key, entry] of this.data.entries()) {
			if (!this._isLiveEntry(entry)) {
				continue;
			}

			liveKeys += 1;
			keySize += estimateSize(String(key));
			valueSize += estimateSize(entry.value);
		}

		this.stats.keys = liveKeys;
		this.stats.ksize = keySize;
		this.stats.vsize = valueSize;
	}

	_startCheckTimer() {
		if (this.options.checkperiod === 0) {
			return;
		}

		this._checkTimer = setInterval(() => {
			this._sweepExpiredEntries();
			this._syncStats();
		}, this.options.checkperiod * 1000);

		this._checkTimer.unref?.();
	}
}

export {NodeCache};
export {NodeCache as NodeCache2};
export default NodeCache;
