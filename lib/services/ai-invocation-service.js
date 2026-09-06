'use strict';

const Joi = require('@hapi/joi');
const Schmervice = require('@hapipal/schmervice');
const { TERMINAL_POLICY, normalizeEventId } = require('../ai/invocation-policy');

const createSchema = Joi.object({
    streamerId: Joi.number().integer().positive().required(), streamSessionId: Joi.number().integer().positive().required(),
    chatUserId: Joi.number().integer().positive().required(), chatIdentityId: Joi.number().integer().positive().required(),
    configurationVersion: Joi.string().trim().min(1).max(120).required(), instructionVersionId: Joi.number().integer().positive().required(),
    eventId: Joi.string().trim().min(1).max(255).required(), quotedPointCost: Joi.number().integer().positive().required()
}).required();

class AiInvocationError extends Error {
    constructor(code, message) { super(message); this.name = 'AiInvocationError'; this.code = code; }
}

module.exports = class AiInvocationService extends Schmervice.Service {
    normalizeEventId(value) { return normalizeEventId(value); }

    async create(input) {
        const values = await createSchema.validateAsync(input);
        const idempotencyKey = this.normalizeEventId(values.eventId);
        if (!idempotencyKey) throw new AiInvocationError('AI_EVENT_ID_INVALID', 'A normalized event ID is required.');
        const { AiInvocation } = this.server.models();
        return AiInvocation.transaction(async (trx) => {
            const existing = await trx('AiInvocation').where({ streamerId: values.streamerId, chatIdentityId: values.chatIdentityId, idempotencyKey }).first();
            if (existing) return { invocation: existing, replayed: true };
            await this._assertReferences(trx, values);
            const relatedExecutionId = `ai:${values.streamerId}:${values.chatIdentityId}:${idempotencyKey}`;
            const reservation = await this.server.services().pointEconomyService.reserveInTransaction(trx, {
                streamerId: values.streamerId, chatUserId: values.chatUserId, streamSessionId: values.streamSessionId,
                amount: values.quotedPointCost, reason: 'ai-invocation-reservation', relatedExecutionId,
                actor: { type: 'user', id: String(values.chatUserId) }, idempotencyKey: `ai-reserve:${values.streamerId}:${values.chatIdentityId}:${idempotencyKey}`
            });
            const now = new Date().toISOString();
            const { eventId, ...fields } = values;
            const [invocation] = await trx('AiInvocation').insert({ ...fields, idempotencyKey, status: 'reserved', reservationStatus: 'reserved', reservationLedgerEntryId: reservation.entry.id, createdAt: now, updatedAt: now }).returning('*');
            return { invocation, replayed: false };
        });
    }

    async beginDispatch(id) {
        const { AiInvocation } = this.server.models();
        return AiInvocation.transaction(async (trx) => {
            const row = await trx('AiInvocation').where({ id }).forUpdate().first();
            if (!row) throw new AiInvocationError('AI_INVOCATION_NOT_FOUND', 'AI invocation not found.');
            if (row.status === 'dispatching' && row.reservationStatus === 'reserved') return row;
            if (row.status !== 'reserved' || row.reservationStatus !== 'reserved') throw new AiInvocationError('AI_RESERVATION_REQUIRED', 'Model dispatch requires an active point reservation.');
            const now = new Date().toISOString();
            await trx('AiInvocation').where({ id }).update({ status: 'dispatching', startedAt: now, updatedAt: now });
            return { ...row, status: 'dispatching', startedAt: now, updatedAt: now };
        });
    }

    // Providers are intentionally accepted only through this guarded entrypoint.
    // A caller cannot reach generate until beginDispatch has verified the durable
    // reservation in the same record that identifies this invocation.
    async invokeProvider(id, generate) {
        if (typeof generate !== 'function') throw new AiInvocationError('AI_PROVIDER_INVALID', 'A provider function is required.');
        const invocation = await this.beginDispatch(id);
        return generate(invocation);
    }

    async finish(id, outcome, usageMetadata = null) {
        const policy = TERMINAL_POLICY[outcome];
        if (!policy) throw new AiInvocationError('AI_OUTCOME_INVALID', 'Unknown AI invocation outcome.');
        const usage = this._usage(usageMetadata);
        const { AiInvocation } = this.server.models();
        return AiInvocation.transaction(async (trx) => {
            const row = await trx('AiInvocation').where({ id }).forUpdate().first();
            if (!row) throw new AiInvocationError('AI_INVOCATION_NOT_FOUND', 'AI invocation not found.');
            if (row.reservationStatus !== 'reserved') return row;
            const economy = this.server.services().pointEconomyService;
            if (policy.settlement === 'committed') await economy.commitReservationInTransaction(trx, row.reservationLedgerEntryId, `ai-commit:${row.id}`);
            else await economy.releaseReservationInTransaction(trx, row.reservationLedgerEntryId, `ai-release:${row.id}`, policy.reasonCode);
            const now = new Date().toISOString();
            await trx('AiInvocation').where({ id }).update({ status: policy.status, reservationStatus: policy.settlement, reasonCode: policy.reasonCode, usageMetadata: usage === null ? null : JSON.stringify(usage), completedAt: now, updatedAt: now });
            return trx('AiInvocation').where({ id }).first();
        });
    }

    async reconcileAbandoned({ olderThan = new Date(Date.now() - 5 * 60_000), limit = 100 } = {}) {
        if (!Number.isInteger(limit) || limit < 1 || limit > 1000) throw new AiInvocationError('AI_RECONCILE_LIMIT_INVALID', 'Reconciliation limit must be between 1 and 1000.');
        const rows = await this.server.models().AiInvocation.query().where({ reservationStatus: 'reserved' }).whereIn('status', ['reserved', 'dispatching']).where('updatedAt', '<', new Date(olderThan).toISOString()).orderBy('id').limit(limit);
        const reconciled = [];
        for (const row of rows) reconciled.push(await this.finish(row.id, 'provider_failure', { reconciliation: true }));
        return reconciled;
    }

    async _assertReferences(trx, values) {
        const [session, identity, instruction] = await Promise.all([
            trx('StreamSession').where({ id: values.streamSessionId, streamerId: values.streamerId }).first(),
            trx('ChatIdentity').where({ id: values.chatIdentityId, chatUserId: values.chatUserId }).first(),
            trx('StreamerInstructionVersion').where({ id: values.instructionVersionId, streamerId: values.streamerId }).first()
        ]);
        if (!session || !identity || !instruction) throw new AiInvocationError('AI_INVOCATION_CONTEXT_INVALID', 'Invocation references must belong to its streamer and chat user.');
    }

    _usage(value) {
        if (value === null) return null;
        if (!value || Array.isArray(value) || typeof value !== 'object') throw new AiInvocationError('AI_USAGE_METADATA_INVALID', 'Usage metadata must be an object.');
        const serialized = JSON.stringify(value);
        if (Buffer.byteLength(serialized) > 4096 || Object.keys(value).length > 32) throw new AiInvocationError('AI_USAGE_METADATA_INVALID', 'Usage metadata must be at most 32 fields and 4096 bytes.');
        return value;
    }
};

module.exports.AiInvocationError = AiInvocationError;
module.exports.TERMINAL_POLICY = TERMINAL_POLICY;
