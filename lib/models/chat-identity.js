'use strict';

const Joi = require('@hapi/joi');
const Schwifty = require('@hapipal/schwifty');

module.exports = class ChatIdentity extends Schwifty.Model {
    static get tableName() { return 'ChatIdentity'; }

    static get joiSchema() {
        return Joi.object({
            id: Joi.number().integer().positive(),
            chatUserId: Joi.number().integer().positive().required(),
            provider: Joi.string().trim().lowercase().pattern(/^[a-z0-9][a-z0-9_-]*$/).max(40).required(),
            providerUserId: Joi.string().trim().min(1).max(255).required(),
            handle: Joi.string().trim().min(1).max(255).allow(null),
            displayName: Joi.string().trim().min(1).max(255).allow(null),
            avatarUrl: Joi.string().uri({ scheme: ['http', 'https'] }).max(2048).allow(null),
            lastSeenAt: Joi.date().iso().required(),
            createdAt: Joi.date().iso(),
            updatedAt: Joi.date().iso()
        });
    }

    static get relationMappings() {
        const ChatUser = require('./chat-user');
        const ChannelRelationship = require('./channel-relationship');
        return {
            chatUser: { relation: Schwifty.Model.BelongsToOneRelation, modelClass: ChatUser, join: { from: 'ChatIdentity.chatUserId', to: 'ChatUser.id' } },
            channelRelationships: { relation: Schwifty.Model.HasManyRelation, modelClass: ChannelRelationship, join: { from: 'ChatIdentity.id', to: 'ChannelRelationship.chatIdentityId' } }
        };
    }
};
