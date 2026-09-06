'use strict';

const Joi = require('@hapi/joi');
const Schwifty = require('@hapipal/schwifty');
const { relationshipTypes } = require('../../migrations/007-create-channel-relationships');

module.exports = class ChannelRelationship extends Schwifty.Model {
    static get tableName() { return 'ChannelRelationship'; }

    static get joiSchema() {
        return Joi.object({
            id: Joi.number().integer().positive(),
            sourceId: Joi.number().integer().positive().required(),
            chatIdentityId: Joi.number().integer().positive().required(),
            relationship: Joi.string().valid(...relationshipTypes).required(),
            tier: Joi.string().trim().min(1).max(100).allow(null),
            observedAt: Joi.date().iso().required(),
            expiresAt: Joi.date().iso().min(Joi.ref('observedAt')).allow(null),
            createdAt: Joi.date().iso(),
            updatedAt: Joi.date().iso()
        });
    }

    static get relationMappings() {
        const ChatIdentity = require('./chat-identity');
        const Source = require('./source');
        return {
            source: { relation: Schwifty.Model.BelongsToOneRelation, modelClass: Source, join: { from: 'ChannelRelationship.sourceId', to: 'Source.id' } },
            chatIdentity: { relation: Schwifty.Model.BelongsToOneRelation, modelClass: ChatIdentity, join: { from: 'ChannelRelationship.chatIdentityId', to: 'ChatIdentity.id' } }
        };
    }
};

module.exports.relationshipTypes = relationshipTypes;
