'use strict';

const Joi = require('@hapi/joi');
const Schwifty = require('@hapipal/schwifty');

module.exports = class StreamSessionParticipant extends Schwifty.Model {
    static get tableName() { return 'StreamSessionParticipant'; }

    static get joiSchema() {
        return Joi.object({
            id: Joi.number().integer().positive(), streamSessionId: Joi.number().integer().positive().required(),
            chatUserId: Joi.number().integer().positive().required(), joinedAt: Joi.date().iso().required(),
            lastActivityAt: Joi.date().iso().required(), messageCount: Joi.number().integer().min(0),
            watchRewardCount: Joi.number().integer().min(0), winCount: Joi.number().integer().min(0),
            commandCount: Joi.number().integer().min(0), privacyExcluded: Joi.boolean(), moderationExcluded: Joi.boolean(),
            createdAt: Joi.date().iso(), updatedAt: Joi.date().iso()
        });
    }
};
