'use strict';

const Schmervice = require('@hapipal/schmervice');

const DEFAULT_LIMITS = Object.freeze({
    maxValueBytes: 16 * 1024,
    maxSessionBytes: 256 * 1024,
    maxSessionValues: 256,
    maxContentRetentionMs: 24 * 60 * 60 * 1000,
    updateAttempts: 8
});

const PLATFORM_NAMESPACE_PREFIX = 'platform.';
const FEATURE_NAMESPACE_PREFIX = 'feature.';

class StateConflictError extends Error {
    constructor(message = 'Stream session state changed concurrently.') {
        super(message);
        this.name = 'StateConflictError';
        this.code = 'STATE_CONFLICT';
    }
}

class StatePolicyError extends Error {
    constructor(message, code = 'STATE_POLICY') {
        super(message);
        this.name = 'StatePolicyError';
        this.code = code;
    }
}

module.exports = class StreamSessionStateService extends Schmervice.Service {
    constructor(server, options = {}) {
        super(server, options);
        this.limits = Object.freeze({ ...DEFAULT_LIMITS, ...(options.limits || {}) });
    }

    stateModel() {
        const { StreamSessionState } = this.server.models();
        if (!StreamSessionState) throw new Error('StreamSessionState must be registered.');
        return StreamSessionState;
    }

    authorizeNamespace(namespace, access = {}) {
        if (!/^[a-z0-9][a-z0-9._-]*$/.test(namespace) || namespace.length > 100) {
            throw new StatePolicyError('State namespace is invalid.', 'INVALID_STATE_NAMESPACE');
        }
        if (namespace.startsWith(PLATFORM_NAMESPACE_PREFIX)) {
            if (access.component !== 'platform') {
                throw new StatePolicyError('Platform state namespaces are reserved.', 'RESERVED_STATE_NAMESPACE');
            }
            return;
        }
        if (access.component === 'feature') {
            const expected = `${FEATURE_NAMESPACE_PREFIX}${access.featureId}.`;
            if (!access.featureId || !namespace.startsWith(expected)) {
                throw new StatePolicyError('Feature executors may only access their own namespace.', 'STATE_NAMESPACE_FORBIDDEN');
            }
        }
    }

    validateKey(key) {
        if (typeof key !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(key) || key.length > 160) {
            throw new StatePolicyError('State key is invalid.', 'INVALID_STATE_KEY');
        }
    }

    serialize(value) {
        if (value === undefined) throw new StatePolicyError('State values must be JSON serializable.', 'INVALID_STATE_VALUE');
        let serializedValue;
        try {
            serializedValue = JSON.stringify(value);
        }
        catch {
            throw new StatePolicyError('State values must be JSON serializable.', 'INVALID_STATE_VALUE');
        }
        if (serializedValue === undefined) throw new StatePolicyError('State values must be JSON serializable.', 'INVALID_STATE_VALUE');
        const sizeBytes = Buffer.byteLength(serializedValue, 'utf8');
        if (sizeBytes > this.limits.maxValueBytes) {
            throw new StatePolicyError(`State value exceeds ${this.limits.maxValueBytes} bytes.`, 'STATE_VALUE_LIMIT');
        }
        return { serializedValue, sizeBytes };
    }

    retention(options, now) {
        const expiresAt = options.expiresAt ? new Date(options.expiresAt) : null;
        if (expiresAt && (!Number.isFinite(expiresAt.getTime()) || expiresAt <= now)) {
            throw new StatePolicyError('expiresAt must be a future timestamp.', 'INVALID_STATE_EXPIRY');
        }
        if (options.containsMessageContent) {
            if (!options.purpose?.trim()) {
                throw new StatePolicyError('Message-derived content requires a recorded purpose.', 'MESSAGE_CONTENT_PURPOSE_REQUIRED');
            }
            if (!expiresAt || expiresAt.getTime() - now.getTime() > this.limits.maxContentRetentionMs) {
                throw new StatePolicyError('Message-derived content requires short retention.', 'MESSAGE_CONTENT_RETENTION_REQUIRED');
            }
        }
        return { expiresAt: expiresAt?.toISOString() || null, purpose: options.purpose?.trim() || null };
    }

    async get(streamSessionId, namespace, key, options = {}) {
        this.authorizeNamespace(namespace, options.access);
        this.validateKey(key);
        const State = this.stateModel();
        const record = await State.query().findOne({ streamSessionId, namespace, key });
        if (!record) return null;
        if (record.expiresAt && new Date(record.expiresAt) <= new Date()) {
            await State.query().delete().where({ id: record.id, version: record.version });
            return null;
        }
        return this.toState(record);
    }

    // expectedVersion=0 creates a value. Updating always requires the version read
    // by the caller, making lost updates observable rather than last-write-wins.
    async compareAndSwap(streamSessionId, namespace, key, expectedVersion, value, options = {}) {
        this.authorizeNamespace(namespace, options.access);
        this.validateKey(key);
        if (!Number.isInteger(expectedVersion) || expectedVersion < 0) {
            throw new StatePolicyError('expectedVersion must be a non-negative integer.', 'INVALID_STATE_VERSION');
        }
        const State = this.stateModel();
        const serialized = this.serialize(value);
        const now = new Date();
        const retention = this.retention(options, now);

        return State.transaction(async (transaction) => {
            const existing = await State.query(transaction).findOne({ streamSessionId, namespace, key });
            if ((existing?.version || 0) !== expectedVersion) throw new StateConflictError();

            const totals = await State.query(transaction)
                .where({ streamSessionId })
                .where((builder) => builder.whereNull('expiresAt').orWhere('expiresAt', '>', now.toISOString()))
                .whereNot({ namespace, key })
                .sum({ bytes: 'sizeBytes' })
                .count({ count: 'id' })
                .first();
            const count = Number(totals.count || 0) + 1;
            const bytes = Number(totals.bytes || 0) + serialized.sizeBytes;
            if (count > this.limits.maxSessionValues || bytes > this.limits.maxSessionBytes) {
                throw new StatePolicyError('Stream session state quota exceeded.', 'STATE_SESSION_LIMIT');
            }

            if (!existing) {
                try {
                    const created = await State.query(transaction).insert({
                        streamSessionId, namespace, key, ...serialized, ...retention, version: 1,
                        updatedAt: now.toISOString()
                    });
                    return this.toState(created);
                }
                catch (error) {
                    if (/unique|constraint/i.test(error.message)) throw new StateConflictError();
                    throw error;
                }
            }

            const version = expectedVersion + 1;
            const changed = await State.query(transaction).where({ id: existing.id, version: expectedVersion }).patch({
                ...serialized, ...retention, version, updatedAt: now.toISOString()
            });
            if (changed !== 1) throw new StateConflictError();
            return this.toState(await State.query(transaction).findById(existing.id));
        });
    }

    async update(streamSessionId, namespace, key, updater, options = {}) {
        for (let attempt = 0; attempt < this.limits.updateAttempts; ++attempt) {
            const current = await this.get(streamSessionId, namespace, key, options);
            const value = await updater(current?.value, current);
            try {
                return await this.compareAndSwap(streamSessionId, namespace, key, current?.version || 0, value, options);
            }
            catch (error) {
                if (!(error instanceof StateConflictError) || attempt === this.limits.updateAttempts - 1) throw error;
            }
        }
    }

    async remove(streamSessionId, namespace, key, expectedVersion, options = {}) {
        this.authorizeNamespace(namespace, options.access);
        this.validateKey(key);
        const deleted = await this.stateModel().query().delete().where({ streamSessionId, namespace, key, version: expectedVersion });
        if (!deleted) throw new StateConflictError();
        return true;
    }

    // Ending a session removes all operational state immediately. Deleting a
    // StreamSession also cascades. Expired rows are hidden on read and this sweep
    // is intended to run periodically (at least daily) for storage reclamation.
    async cleanupSession(streamSessionId, transaction) {
        return this.stateModel().query(transaction).delete().where({ streamSessionId });
    }

    async purgeExpired(now = new Date()) {
        return this.stateModel().query().delete().whereNotNull('expiresAt').where('expiresAt', '<=', now.toISOString());
    }

    toState(record) {
        return {
            streamSessionId: record.streamSessionId,
            namespace: record.namespace,
            key: record.key,
            value: JSON.parse(record.serializedValue),
            version: record.version,
            updatedAt: record.updatedAt,
            expiresAt: record.expiresAt || null,
            purpose: record.purpose || null
        };
    }
};

module.exports.DEFAULT_LIMITS = DEFAULT_LIMITS;
module.exports.PLATFORM_NAMESPACE_PREFIX = PLATFORM_NAMESPACE_PREFIX;
module.exports.FEATURE_NAMESPACE_PREFIX = FEATURE_NAMESPACE_PREFIX;
module.exports.StateConflictError = StateConflictError;
module.exports.StatePolicyError = StatePolicyError;
