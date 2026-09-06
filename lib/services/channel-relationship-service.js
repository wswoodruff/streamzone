'use strict';

const Joi = require('@hapi/joi');
const Schmervice = require('@hapipal/schmervice');
const { relationshipTypes } = require('../models/channel-relationship');

// Presence inferred from chat metadata is intentionally short lived. Callers may
// choose a different policy window, but expired observations are never active.
const DEFAULT_MAX_AGE_MS = 15 * 60 * 1000;
const factSchema = Joi.object({
    relationship: Joi.string().valid(...relationshipTypes).required(),
    tier: Joi.string().trim().min(1).max(100).allow(null),
    expiresAt: Joi.date().iso().allow(null)
});
const observationSchema = Joi.object({
    sourceId: Joi.number().integer().positive().required(),
    chatIdentityId: Joi.number().integer().positive().required(),
    observedAt: Joi.date().iso().default(() => new Date()),
    facts: Joi.array().items(factSchema).unique('relationship').required()
}).required();

module.exports = class ChannelRelationshipService extends Schmervice.Service {
    async upsert(observation) {
        const value = await observationSchema.validateAsync(observation, { stripUnknown: false });
        const observedAt = new Date(value.observedAt).toISOString();
        const { ChannelRelationship, ChatIdentity, Source } = this.server.models();

        return ChannelRelationship.transaction(async (transaction) => {
            const [source, identity] = await Promise.all([
                Source.query(transaction).findById(value.sourceId),
                ChatIdentity.query(transaction).findById(value.chatIdentityId)
            ]);
            if (!source || !identity) throw new Error('Source and chat identity must exist.');
            if (source.provider !== identity.provider) throw new Error('Source and chat identity providers must match.');

            const current = await ChannelRelationship.query(transaction)
                .where({ sourceId: value.sourceId, chatIdentityId: value.chatIdentityId });
            // Network retries can deliver snapshots out of order. An older
            // snapshot must not resurrect or remove facts from a newer one.
            if (current.some((row) => new Date(row.observedAt) > new Date(observedAt))) return current;

            const names = value.facts.map(({ relationship }) => relationship);
            const absent = ChannelRelationship.query(transaction).where({ sourceId: value.sourceId, chatIdentityId: value.chatIdentityId });
            if (names.length) absent.whereNotIn('relationship', names);
            await absent.delete();

            const now = new Date().toISOString();
            for (const fact of value.facts) {
                await ChannelRelationship.query(transaction).insert({
                    sourceId: value.sourceId,
                    chatIdentityId: value.chatIdentityId,
                    relationship: fact.relationship,
                    tier: fact.tier ?? null,
                    observedAt,
                    expiresAt: fact.expiresAt ? new Date(fact.expiresAt).toISOString() : null,
                    updatedAt: now
                }).onConflict(['sourceId', 'chatIdentityId', 'relationship']).merge([
                    'tier', 'observedAt', 'expiresAt', 'updatedAt'
                ]);
            }
            return ChannelRelationship.query(transaction).where({ sourceId: value.sourceId, chatIdentityId: value.chatIdentityId });
        });
    }

    async activeFor(sourceId, chatIdentityId, options = {}) {
        const asOf = new Date(options.asOf ?? Date.now());
        const maxAgeMs = options.maxAgeMs ?? DEFAULT_MAX_AGE_MS;
        if (!Number.isFinite(maxAgeMs) || maxAgeMs < 0 || Number.isNaN(asOf.getTime())) throw new TypeError('Invalid relationship policy time.');
        const { ChannelRelationship } = this.server.models();
        const rows = await ChannelRelationship.query().where({ sourceId, chatIdentityId });
        return rows.filter((row) => {
            const observed = new Date(row.observedAt).getTime();
            const expiry = row.expiresAt && new Date(row.expiresAt).getTime();
            return observed <= asOf.getTime() && asOf.getTime() - observed <= maxAgeMs && (!expiry || expiry > asOf.getTime());
        });
    }
};

module.exports.DEFAULT_MAX_AGE_MS = DEFAULT_MAX_AGE_MS;
module.exports.factSchema = factSchema;
module.exports.observationSchema = observationSchema;
