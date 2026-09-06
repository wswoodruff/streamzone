'use strict';

const Joi = require('@hapi/joi');
const Schmervice = require('@hapipal/schmervice');

const actorSchema = Joi.object({
    type: Joi.string().valid('system', 'moderator', 'user').required(),
    id: Joi.string().trim().min(1).max(255).required()
}).required();

const operationSchema = Joi.object({
    streamerId: Joi.number().integer().positive().required(), chatUserId: Joi.number().integer().positive().required(),
    amount: Joi.number().integer().positive().required(), reason: Joi.string().trim().min(1).max(255).required(),
    idempotencyKey: Joi.string().trim().min(1).max(255).required(), streamSessionId: Joi.number().integer().positive().allow(null),
    relatedExecutionId: Joi.string().trim().min(1).max(255).allow(null), actor: actorSchema,
    occurredAt: Joi.date().iso()
}).required();

const earningSchema = Joi.object({
    policyId: Joi.number().integer().positive().required(), chatUserId: Joi.number().integer().positive().required(),
    streamSessionId: Joi.number().integer().positive().allow(null), idempotencyKey: Joi.string().trim().min(1).max(255).required(),
    actor: actorSchema, occurredAt: Joi.date().iso().required(), relatedExecutionId: Joi.string().trim().min(1).max(255).allow(null)
}).required();

module.exports = class PointEconomyService extends Schmervice.Service {
    award(input) { return this._change('award', 1, input); }
    reserve(input) { return this._change('reserve', -1, input); }
    spend(input) { return this._change('spend', -1, input); }
    refund(input) { return this._refund(input); }

    async reserveInTransaction(transaction, input) {
        const event = await operationSchema.validateAsync(input);
        return this._changeInTransaction(transaction, 'reserve', -1, event);
    }

    async commitReservationInTransaction(transaction, ledgerEntryId, idempotencyKey) {
        const existing = await transaction('PointReservationSettlement').where({ idempotencyKey }).first();
        if (existing) return { applied: false, settlement: existing };
        const reservation = await transaction('PointLedgerEntry').where({ id: ledgerEntryId, type: 'reserve' }).first();
        if (!reservation) throw new Error('Point reservation not found.');
        const prior = await transaction('PointReservationSettlement').where({ ledgerEntryId }).first();
        if (prior) return { applied: false, settlement: prior };
        const [settlement] = await transaction('PointReservationSettlement').insert({ ledgerEntryId, idempotencyKey }).returning('*');
        await transaction('PointAccount').where({ id: reservation.accountId }).increment('lifetimeSpent', Math.abs(Number(reservation.delta))).update({ updatedAt: new Date().toISOString() });
        return { applied: true, settlement };
    }

    async releaseReservationInTransaction(transaction, ledgerEntryId, idempotencyKey, reason = 'RESERVATION_RELEASED') {
        const reservation = await transaction('PointLedgerEntry').where({ id: ledgerEntryId, type: 'reserve' }).first();
        if (!reservation) throw new Error('Point reservation not found.');
        if (await transaction('PointReservationSettlement').where({ ledgerEntryId }).first()) throw new Error('Committed reservation cannot be released.');
        const account = await transaction('PointAccount').where({ id: reservation.accountId }).first();
        const released = await transaction('PointLedgerEntry').where({ accountId: reservation.accountId, relatedExecutionId: reservation.relatedExecutionId, type: 'refund' }).sum({ total: 'delta' }).first();
        if (Number(released.total || 0) >= Math.abs(Number(reservation.delta))) {
            const existing = await transaction('PointLedgerEntry').where({ idempotencyKey }).first();
            if (existing) return { applied: false, entry: existing };
            throw new Error('Point reservation has already been released.');
        }
        return this._changeInTransaction(transaction, 'refund', 1, {
            streamerId: account.streamerId, chatUserId: account.chatUserId, streamSessionId: reservation.streamSessionId,
            amount: Math.abs(Number(reservation.delta)), reason, relatedExecutionId: reservation.relatedExecutionId,
            actor: { type: 'system', id: 'point-economy-service' }, idempotencyKey
        });
    }

    async settleReservation(relatedExecutionId, idempotencyKey) {
        if (!relatedExecutionId || !idempotencyKey) throw new Error('Settlement identifiers are required.');
        const { PointAccount } = this.server.models();
        return PointAccount.transaction(async (transaction) => {
            const existing = await transaction('PointReservationSettlement').where({ idempotencyKey }).first();
            if (existing) return { applied: false, settlement: existing };
            const reservation = await transaction('PointLedgerEntry').where({ relatedExecutionId: String(relatedExecutionId), type: 'reserve' }).first();
            if (!reservation) throw new Error('Related point reservation not found.');
            const [settlement] = await transaction('PointReservationSettlement').insert({ ledgerEntryId: reservation.id, idempotencyKey }).returning('*');
            await transaction('PointAccount').where({ id: reservation.accountId }).increment('lifetimeSpent', Math.abs(Number(reservation.delta))).update({ updatedAt: new Date().toISOString() });
            return { applied: true, settlement };
        });
    }

    async adjust(input) {
        const values = await operationSchema.concat(Joi.object({ direction: Joi.string().valid('credit', 'debit').required() })).validateAsync(input);
        if (values.actor.type === 'user') throw new Error('Point adjustments require a system or moderator actor.');
        const { direction, ...event } = values;
        return this._change('adjustment', direction === 'credit' ? 1 : -1, event);
    }

    async applyEarningPolicy(input) {
        const event = await earningSchema.validateAsync(input);
        const { EarningPolicy } = this.server.models();
        return EarningPolicy.transaction(async (transaction) => {
            const duplicate = await transaction('PointLedgerEntry').where({ idempotencyKey: event.idempotencyKey }).first();
            if (duplicate) return { applied: false, entry: duplicate };
            const policy = await transaction('EarningPolicy').where({ id: event.policyId, enabled: true }).first();
            if (!policy) throw new Error('Enabled earning policy is required.');
            if (policy.eventType === 'participationInterval' && !event.streamSessionId) {
                throw new Error('Participation intervals require a stream session.');
            }
            await this._assertSession(transaction, policy.streamerId, event.streamSessionId);
            const account = await this._account(transaction, policy.streamerId, event.chatUserId);
            const occurredAt = new Date(event.occurredAt).toISOString();
            const cappedAmount = await this._cappedAward(transaction, account.id, policy, event.streamSessionId, occurredAt);
            if (cappedAmount === 0) return { applied: false, capped: true, awarded: 0 };
            const entry = await this._insert(transaction, account, {
                ...event, streamerId: policy.streamerId, amount: cappedAmount,
                reason: `${policy.eventType}:${policy.name}`, occurredAt
            }, 'award', cappedAmount, policy.id);
            return { applied: true, capped: cappedAmount < policy.points, awarded: cappedAmount, entry };
        });
    }

    async _change(type, sign, input) {
        const event = await operationSchema.validateAsync(input);
        const { PointAccount } = this.server.models();
        return PointAccount.transaction(async (transaction) => {
            return this._changeInTransaction(transaction, type, sign, event);
        });
    }

    async _changeInTransaction(transaction, type, sign, event) {
        const duplicate = await transaction('PointLedgerEntry').where({ idempotencyKey: event.idempotencyKey }).first();
        if (duplicate) return { applied: false, entry: duplicate };
        await this._assertSession(transaction, event.streamerId, event.streamSessionId);
        const account = await this._account(transaction, event.streamerId, event.chatUserId);
        const delta = sign * event.amount;
        if (delta < 0 && Number(account.availableBalance) < event.amount) throw new Error('Insufficient point balance.');
        const entry = await this._insert(transaction, account, event, type, delta);
        return { applied: true, entry };
    }

    async _refund(input) {
        const event = await operationSchema.validateAsync(input);
        if (!event.relatedExecutionId) throw new Error('Refunds require a related redemption or execution ID.');
        const { PointAccount } = this.server.models();
        return PointAccount.transaction(async (transaction) => {
            const duplicate = await transaction('PointLedgerEntry').where({ idempotencyKey: event.idempotencyKey }).first();
            if (duplicate) return { applied: false, entry: duplicate };
            const account = await this._account(transaction, event.streamerId, event.chatUserId);
            const debits = await transaction('PointLedgerEntry').where({ accountId: account.id, relatedExecutionId: event.relatedExecutionId })
                .whereIn('type', ['reserve', 'spend']).sum({ total: transaction.raw('-delta') }).first();
            const refunds = await transaction('PointLedgerEntry').where({ accountId: account.id, relatedExecutionId: event.relatedExecutionId, type: 'refund' })
                .sum({ total: 'delta' }).first();
            if (Number(debits.total || 0) - Number(refunds.total || 0) < event.amount) throw new Error('Refund exceeds the related debit.');
            await this._assertSession(transaction, event.streamerId, event.streamSessionId);
            const entry = await this._insert(transaction, account, event, 'refund', event.amount);
            return { applied: true, entry };
        });
    }

    async reconcile(accountId, options = {}) {
        const { PointAccount } = this.server.models();
        return PointAccount.transaction(async (transaction) => {
            const account = await transaction('PointAccount').where({ id: accountId }).first();
            if (!account) throw new Error('Point account not found.');
            const entries = await transaction('PointLedgerEntry').where({ accountId }).orderBy('id');
            const expected = entries.reduce((totals, entry) => {
                totals.availableBalance += Number(entry.delta);
                if (entry.type === 'award' || (entry.type === 'adjustment' && entry.delta > 0)) totals.lifetimeEarned += Number(entry.delta);
                if (entry.type === 'spend' || (entry.type === 'adjustment' && entry.delta < 0)) totals.lifetimeSpent += Math.abs(Number(entry.delta));
                return totals;
            }, { availableBalance: 0, lifetimeEarned: 0, lifetimeSpent: 0 });
            const actual = { availableBalance: Number(account.availableBalance), lifetimeEarned: Number(account.lifetimeEarned), lifetimeSpent: Number(account.lifetimeSpent) };
            const consistent = Object.keys(expected).every((key) => expected[key] === actual[key]);
            if (options.rebuild && !consistent) await transaction('PointAccount').where({ id: accountId }).update({ ...expected, updatedAt: new Date().toISOString() });
            return { consistent, rebuilt: Boolean(options.rebuild && !consistent), expected, actual };
        });
    }

    async _account(transaction, streamerId, chatUserId) {
        await transaction('PointAccount').insert({ streamerId, chatUserId }).onConflict(['streamerId', 'chatUserId']).ignore();
        // Locking the single account row serializes competing debits on databases
        // that support SELECT FOR UPDATE. SQLite serializes the transaction's
        // writes, while its CHECK constraint remains the final safety net.
        return transaction('PointAccount').where({ streamerId, chatUserId }).forUpdate().first();
    }

    async _assertSession(transaction, streamerId, streamSessionId) {
        if (!streamSessionId) return;
        const session = await transaction('StreamSession').where({ id: streamSessionId }).first();
        if (!session || session.streamerId !== streamerId) throw new Error('Stream session does not belong to streamer.');
    }

    async _insert(transaction, account, event, type, delta, earningPolicyId = null) {
        const createdAt = event.occurredAt ? new Date(event.occurredAt).toISOString() : new Date().toISOString();
        const [entry] = await transaction('PointLedgerEntry').insert({
            accountId: account.id, earningPolicyId, streamSessionId: event.streamSessionId || null,
            relatedExecutionId: event.relatedExecutionId || null, delta, type, reason: event.reason,
            actorType: event.actor.type, actorId: event.actor.id, idempotencyKey: event.idempotencyKey, createdAt
        }).returning('*');
        const earned = type === 'award' || (type === 'adjustment' && delta > 0) ? delta : 0;
        const spent = type === 'spend' || (type === 'adjustment' && delta < 0) ? Math.abs(delta) : 0;
        await transaction('PointAccount').where({ id: account.id }).update({
            availableBalance: Number(account.availableBalance) + delta,
            lifetimeEarned: Number(account.lifetimeEarned) + earned,
            lifetimeSpent: Number(account.lifetimeSpent) + spent,
            updatedAt: new Date().toISOString()
        });
        return entry;
    }

    async _cappedAward(transaction, accountId, policy, streamSessionId, occurredAt) {
        let amount = Number(policy.points);
        const base = () => transaction('PointLedgerEntry').where({ accountId, earningPolicyId: policy.id, type: 'award' });
        if (policy.perSessionCap !== null) {
            const row = await base().where({ streamSessionId }).sum({ total: 'delta' }).first();
            amount = Math.min(amount, Math.max(0, Number(policy.perSessionCap) - Number(row.total || 0)));
        }
        if (policy.perDayCap !== null) {
            const start = new Date(occurredAt); start.setUTCHours(0, 0, 0, 0);
            const end = new Date(start); end.setUTCDate(end.getUTCDate() + 1);
            const row = await base().where('createdAt', '>=', start.toISOString()).where('createdAt', '<', end.toISOString()).sum({ total: 'delta' }).first();
            amount = Math.min(amount, Math.max(0, Number(policy.perDayCap) - Number(row.total || 0)));
        }
        return amount;
    }
};

module.exports.operationSchema = operationSchema;
module.exports.earningSchema = earningSchema;
