'use strict';

const Joi = require('@hapi/joi');
const Schmervice = require('@hapipal/schmervice');

const eventSchema = Joi.object({
    idempotencyKey: Joi.string().trim().min(1).max(255).required(),
    streamerId: Joi.number().integer().positive().required(),
    streamSessionId: Joi.number().integer().positive().required(),
    chatIdentityId: Joi.number().integer().positive().required(),
    type: Joi.string().valid('message', 'watchReward', 'win', 'command').required(),
    amount: Joi.number().integer().positive().default(1),
    occurredAt: Joi.date().iso().required()
}).required();

const counters = Object.freeze({ message: 'messageCount', watchReward: 'watchRewardCount', win: 'winCount', command: 'commandCount' });
const metrics = new Set(Object.values(counters));

module.exports = class ParticipantActivityService extends Schmervice.Service {
    async ingest(input) {
        const event = await eventSchema.validateAsync(input, { stripUnknown: false });
        const occurredAt = new Date(event.occurredAt).toISOString();
        const { ChatIdentity, StreamSession, StreamerParticipant } = this.server.models();

        return StreamerParticipant.transaction(async (transaction) => {
            const session = await StreamSession.query(transaction).findById(event.streamSessionId);
            if (!session || session.streamerId !== event.streamerId) throw new Error('Stream session does not belong to streamer.');
            const identity = await ChatIdentity.query(transaction).findById(event.chatIdentityId).withGraphFetched('chatUser');
            if (!identity || identity.chatUser.status !== 'active') throw new Error('Active chat identity is required.');
            const chatUserId = identity.chatUserId;
            const inserted = await transaction('ParticipantActivityEvent').insert({
                idempotencyKey: event.idempotencyKey, streamerId: event.streamerId, streamSessionId: event.streamSessionId,
                chatUserId, type: event.type, amount: event.amount, occurredAt
            }).onConflict('idempotencyKey').ignore().returning('id');
            if (!inserted.length) return { applied: false, idempotencyKey: event.idempotencyKey };

            const counter = counters[event.type];
            await this.increment(transaction, 'StreamerParticipant', { streamerId: event.streamerId, chatUserId },
                { first: 'firstSeenAt', last: 'lastSeenAt' }, counter, event.amount, occurredAt);
            await this.increment(transaction, 'StreamSessionParticipant', { streamSessionId: event.streamSessionId, chatUserId },
                { first: 'joinedAt', last: 'lastActivityAt' }, counter, event.amount, occurredAt);
            return { applied: true, idempotencyKey: event.idempotencyKey, chatUserId };
        });
    }

    async increment(transaction, table, key, timestamps, counter, amount, occurredAt) {
        const row = await transaction(table).where(key).first();
        if (!row) {
            await transaction(table).insert({ ...key, [timestamps.first]: occurredAt, [timestamps.last]: occurredAt, [counter]: amount });
            return;
        }
        await transaction(table).where({ id: row.id }).update({
            [timestamps.first]: new Date(row[timestamps.first]) < new Date(occurredAt) ? row[timestamps.first] : occurredAt,
            [timestamps.last]: new Date(row[timestamps.last]) > new Date(occurredAt) ? row[timestamps.last] : occurredAt,
            [counter]: Number(row[counter]) + amount,
            updatedAt: new Date().toISOString()
        });
    }

    async leaderboard(scope, scopeId, metric, options = {}) {
        if (!['streamer', 'session'].includes(scope)) throw new Error('Leaderboard scope must be streamer or session.');
        if (!metrics.has(metric)) throw new Error('Unsupported leaderboard metric.');
        const limit = Math.min(Math.max(options.limit || 25, 1), 100);
        const table = scope === 'streamer' ? 'StreamerParticipant' : 'StreamSessionParticipant';
        const idColumn = scope === 'streamer' ? 'streamerId' : 'streamSessionId';
        const model = this.server.models()[table];
        const query = model.query().alias('participant').where(`participant.${idColumn}`, scopeId)
            .where('participant.privacyExcluded', false).where('participant.moderationExcluded', false)
            .where(`participant.${metric}`, '>', 0);
        if (scope === 'session') {
            query.join('StreamSession as scopeSession', 'scopeSession.id', 'participant.streamSessionId')
                .join('StreamerParticipant as durable', function () {
                    this.on('durable.chatUserId', '=', 'participant.chatUserId')
                        .on('durable.streamerId', '=', 'scopeSession.streamerId');
                });
            query.where('durable.privacyExcluded', false).where('durable.moderationExcluded', false);
        }
        if (options.cursor) {
            const { value, chatUserId } = options.cursor;
            if (!Number.isInteger(value) || !Number.isInteger(chatUserId)) throw new Error('Invalid leaderboard cursor.');
            query.where((builder) => builder.where(`participant.${metric}`, '<', value)
                .orWhere((tie) => tie.where(`participant.${metric}`, value).where('participant.chatUserId', '>', chatUserId)));
        }
        const rows = await query.select('participant.*').orderBy(`participant.${metric}`, 'desc').orderBy('participant.chatUserId', 'asc').limit(limit + 1);
        const page = rows.slice(0, limit);
        const tail = page.at(-1);
        return { items: page, nextCursor: rows.length > limit ? { value: tail[metric], chatUserId: tail.chatUserId } : null };
    }
};

module.exports.eventSchema = eventSchema;
module.exports.counters = counters;
