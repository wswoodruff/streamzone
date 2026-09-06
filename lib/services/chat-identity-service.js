'use strict';

const Joi = require('@hapi/joi');
const Schmervice = require('@hapipal/schmervice');

const authorSchema = Joi.object({
    provider: Joi.string().trim().lowercase().pattern(/^[a-z0-9][a-z0-9_-]*$/).max(40).required(),
    providerUserId: Joi.string().trim().min(1).max(255).required(),
    handle: Joi.string().trim().min(1).max(255).allow(null),
    displayName: Joi.string().trim().min(1).max(255).allow(null),
    avatarUrl: Joi.string().uri({ scheme: ['http', 'https'] }).max(2048).allow(null),
    lastSeenAt: Joi.date().iso().default(() => new Date())
}).required();

module.exports = class ChatIdentityService extends Schmervice.Service {
    static get authorSchema() { return authorSchema; }

    async resolve(author, relationshipObservation) {
        const normalized = await authorSchema.validateAsync(author, { stripUnknown: false });
        normalized.lastSeenAt = new Date(normalized.lastSeenAt).toISOString();
        const { ChatIdentity, ChatUser } = this.server.models();

        const identity = await ChatIdentity.transaction(async (transaction) => {
            // Taking the write lock before looking up the identity also serializes
            // first sightings on SQLite. The unique upsert is the final arbiter on
            // databases that allow concurrent writers.
            const candidate = await ChatUser.query(transaction).insert({ status: 'active' });
            await ChatIdentity.query(transaction)
                .insert({ ...normalized, chatUserId: candidate.id })
                .onConflict(['provider', 'providerUserId'])
                .ignore();

            const identity = await ChatIdentity.query(transaction).findOne({
                provider: normalized.provider,
                providerUserId: normalized.providerUserId
            });
            if (identity.chatUserId !== candidate.id) {
                await ChatUser.query(transaction).deleteById(candidate.id);
            }

            const changes = {
                handle: normalized.handle ?? null,
                displayName: normalized.displayName ?? null,
                avatarUrl: normalized.avatarUrl ?? null,
                lastSeenAt: normalized.lastSeenAt,
                updatedAt: new Date().toISOString()
            };
            return ChatIdentity.query(transaction).patchAndFetchById(identity.id, changes);
        });

        // Adapters pass their authoritative channel snapshot here alongside the
        // author. Identity resolution never translates it into site membership.
        if (relationshipObservation) {
            await this.server.services().channelRelationshipService.upsert({
                ...relationshipObservation,
                chatIdentityId: identity.id
            });
        }
        return identity;
    }
};
