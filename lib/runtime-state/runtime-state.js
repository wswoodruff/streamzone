'use strict';

// Adapter contract for high-churn, non-durable state. Command executors depend on
// this interface, not on SQLite or Redis. Implementations must make both methods
// atomic across competing events.
module.exports = class RuntimeState {
    async consumeCooldown(_key, _durationMs, _now) {
        throw new Error('RuntimeState.consumeCooldown() is not implemented.');
    }

    async rememberOnce(_key, _ttlMs, _now) {
        throw new Error('RuntimeState.rememberOnce() is not implemented.');
    }

    async clearSession(_streamSessionId) {
        throw new Error('RuntimeState.clearSession() is not implemented.');
    }
};
