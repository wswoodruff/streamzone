'use strict';

const Joi = require('@hapi/joi');
const Schwifty = require('@hapipal/schwifty');

module.exports = class StreamerParticipant extends Schwifty.Model {
    static get tableName() { return 'StreamerParticipant'; }

    static get joiSchema() {
        return Joi.object({
            id: Joi.number().integer().positive(), streamerId: Joi.number().integer().positive().required(),
            chatUserId: Joi.number().integer().positive().required(), firstSeenAt: Joi.date().iso().required(),
            lastSeenAt: Joi.date().iso().required(), messageCount: Joi.number().integer().min(0),
            watchRewardCount: Joi.number().integer().min(0), winCount: Joi.number().integer().min(0),
            commandCount: Joi.number().integer().min(0), privacyExcluded: Joi.boolean(), moderationExcluded: Joi.boolean(),
            createdAt: Joi.date().iso(), updatedAt: Joi.date().iso()
        });
    }
};
