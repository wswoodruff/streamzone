'use strict';

// Transactional coordination shared by every runtime process. All timestamps are
// supplied by callers, making the state machine deterministic in adapter tests.
module.exports = class DurableRuntimeStore {
    constructor(knex, { ownerId, leaseMs = 30_000 } = {}) {
        if (!knex) throw new TypeError('A Knex instance is required.');
        if (!ownerId) throw new TypeError('A stable worker ownerId is required.');
        this.knex = knex; this.ownerId = ownerId; this.leaseMs = leaseMs;
    }

    async acquireLease(key, now = Date.now()) {
        return this.knex.transaction(async (trx) => {
            const row = await trx('RuntimeLease').where({ key }).first();
            if (row && row.ownerId !== this.ownerId && new Date(row.expiresAt).getTime() > now) return false;
            const value = { key, ownerId: this.ownerId, expiresAt: new Date(now + this.leaseMs).toISOString(), updatedAt: new Date(now).toISOString() };
            await trx('RuntimeLease').insert(value).onConflict('key').merge(value); return true;
        });
    }
    async releaseLease(key) { await this.knex('RuntimeLease').where({ key, ownerId: this.ownerId }).delete(); }
    async cursor(key) { return (await this.knex('RuntimeCursor').where({ key }).first()) || { pageToken: null, pollingIntervalMs: 5000 }; }
    async saveCursor(key, pageToken, pollingIntervalMs, now = Date.now()) { const value = { key, pageToken, pollingIntervalMs, updatedAt: new Date(now).toISOString() }; await this.knex('RuntimeCursor').insert(value).onConflict('key').merge(value); }
    async claimEvent(key, now = Date.now()) {
        return this.knex.transaction(async (trx) => {
            const row = await trx('RuntimeEvent').where({ key }).first();
            if (row && (row.status !== 'processing' || new Date(row.leaseExpiresAt).getTime() > now)) return false;
            const value = { key, status: 'processing', ownerId: this.ownerId, leaseExpiresAt: new Date(now + this.leaseMs).toISOString(), updatedAt: new Date(now).toISOString() };
            if (row) await trx('RuntimeEvent').where({ key }).update(value); else await trx('RuntimeEvent').insert({ ...value, createdAt: value.updatedAt });
            return true;
        });
    }
    async completeEvent(key, outcome, terminal = false, now = Date.now()) { await this.knex('RuntimeEvent').where({ key, ownerId: this.ownerId }).update({ status: terminal ? 'terminal_failure' : 'completed', outcome: JSON.stringify(outcome), completedAt: new Date(now).toISOString(), updatedAt: new Date(now).toISOString() }); }
    async consumeCooldown(key, durationMs, now = Date.now()) { return this.knex.transaction(async (trx) => { const row = await trx('RuntimeCooldown').where({ key }).first(); const availableAt = row ? new Date(row.availableAt).getTime() : 0; if (availableAt > now) return { allowed: false, retryAfterMs: availableAt - now }; const value = { key, availableAt: new Date(now + durationMs).toISOString() }; await trx('RuntimeCooldown').insert(value).onConflict('key').merge(value); return { allowed: true, retryAfterMs: 0 }; }); }
    async delivery(key) { return this.knex('RuntimeDelivery').where({ eventKey: key }).first(); }
    async beginDelivery(key, now = Date.now()) { const existing = await this.delivery(key); if (existing?.status === 'sent' || existing?.status === 'terminal_failure') return existing; const value = { eventKey: key, status: 'sending', attempts: Number(existing?.attempts || 0) + 1, updatedAt: new Date(now).toISOString() }; await this.knex('RuntimeDelivery').insert(value).onConflict('eventKey').merge(value); return value; }
    async finishDelivery(key, status, details = {}, now = Date.now()) { await this.knex('RuntimeDelivery').where({ eventKey: key }).update({ status, providerMessageId: details.providerMessageId || null, errorCode: details.errorCode || null, updatedAt: new Date(now).toISOString() }); }
};
