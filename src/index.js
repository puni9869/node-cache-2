import {EventEmitter} from 'node:events';

export class NodeCache2 extends EventEmitter {
	constructor(options = {}) {
		super(options);
		this.get = this.get.bind(this);
		this.set = this.set.bind(this);
		// this.mget = this.mget.bind(this);
		// this.mset = this.mset.bind(this);
		// this.del = this.del.bind(this);
		// this.take = this.take.bind(this);
		// this.ttl = this.ttl.bind(this);
		// this.getTtl = this.getTtl.bind(this);
		// this.keys = this.keys.bind(this);
		// this.has = this.has.bind(this);
		// this.getStats = this.getStats.bind(this);
		// this.flushAll = this.flushAll.bind(this);
		// this.flushStats = this.flushStats.bind(this);
		// this.close = this.close.bind(this);

		// this._checkData = this._checkData.bind(this);
		// this._check = this._check.bind(this);
		// this._isInvalidKey = this._isInvalidKey.bind(this);
		// this._wrap = this._wrap.bind(this);
		// this._error = this._error.bind(this);
		//
		// this._initErrors = this._initErrors.bind(this);
		// this.options = options;
		// this._initErrors();

		this.data = {};

		this.options = Object.assign({
			forceString: false,
			objectValueSize: 80,
			promiseValueSize: 80,
			arrayValueSize: 40,
			stdTTL: 0,
			checkperiod: 600,
			useClones: true,
			deleteOnExpire: true,
			enableLegacyCallbacks: false,
			maxKeys: -1
		}, this.options);

		this.stats = {
			hits: 0,
			misses: 0,
			keys: 0,
			ksize: 0,
			vsize: 0
		};
		this.validKeyTypes = ["string", "number"];
		// this._checkData();
	}

	set(key, value, ttl) {
		this.data[key] = value;
	}

	get(key) {
		return this.data[key];
	}
}
