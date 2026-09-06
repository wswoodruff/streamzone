'use strict';

const RuntimeState = require('./runtime-state');

module.exports = class InProcessRuntimeState extends RuntimeState {
    constructor() {
        super();
        this.entries = new Map();
    }

    consumeCooldown(key, durationMs, now = Date.now()) {
        this.assertKey(key);
        const timestamp = this.timestamp(now);
        const storageKey = `cooldown:${key}`;
        const availableAt = this.entries.get(storageKey) || 0;
        if (availableAt > timestamp) return { allowed: false, retryAfterMs: availableAt - timestamp };
        this.entries.set(storageKey, timestamp + durationMs);
        return { allowed: true, retryAfterMs: 0 };
    }

    rememberOnce(key, ttlMs, now = Date.now()) {
        this.assertKey(key);
        const timestamp = this.timestamp(now);
        const storageKey = `dedupe:${key}`;
        const expiresAt = this.entries.get(storageKey) || 0;
        if (expiresAt > timestamp) return false;
        this.entries.set(storageKey, timestamp + ttlMs);
        return true;
    }

    clearSession(streamSessionId) {
        const marker = `session:${streamSessionId}:`;
        let deleted = 0;
        for (const key of this.entries.keys()) {
            if (key.includes(marker)) {
                this.entries.delete(key);
                ++deleted;
            }
        }
        return deleted;
    }

    assertKey(key) {
        if (typeof key !== 'string' || !key.length) throw new TypeError('Runtime state key must be a non-empty string.');
    }

    timestamp(now) {
        const value = now instanceof Date ? now.getTime() : now;
        if (!Number.isFinite(value)) throw new TypeError('Runtime state time must be valid.');
        return value;
    }
};
