'use strict';

const Joi = require('@hapi/joi');
const Schwifty = require('@hapipal/schwifty');

module.exports = class ChatUser extends Schwifty.Model {
    static get tableName() { return 'ChatUser'; }

    static get joiSchema() {
        return Joi.object({
            id: Joi.number().integer().positive(),
            userId: Joi.number().integer().positive().allow(null),
            status: Joi.string().valid('active', 'merged').default('active'),
            mergedIntoChatUserId: Joi.number().integer().positive().allow(null),
            createdAt: Joi.date().iso(),
            updatedAt: Joi.date().iso()
        });
    }

    static get relationMappings() {
        const ChatIdentity = require('./chat-identity');
        const User = require('./user');

        return {
            user: { relation: Schwifty.Model.BelongsToOneRelation, modelClass: User, join: { from: 'ChatUser.userId', to: 'User.id' } },
            identities: { relation: Schwifty.Model.HasManyRelation, modelClass: ChatIdentity, join: { from: 'ChatUser.id', to: 'ChatIdentity.chatUserId' } },
            mergedInto: { relation: Schwifty.Model.BelongsToOneRelation, modelClass: module.exports, join: { from: 'ChatUser.mergedIntoChatUserId', to: 'ChatUser.id' } }
        };
    }
};
