'use strict';

const Joi = require('@hapi/joi');
const Schwifty = require('@hapipal/schwifty');

module.exports = class ParticipantActivityEvent extends Schwifty.Model {
    static get tableName() { return 'ParticipantActivityEvent'; }
    static get joiSchema() {
        return Joi.object({
            id: Joi.number().integer().positive(), idempotencyKey: Joi.string().max(255).required(),
            streamerId: Joi.number().integer().positive().required(), streamSessionId: Joi.number().integer().positive().required(),
            chatUserId: Joi.number().integer().positive().required(), type: Joi.string().valid('message', 'watchReward', 'win', 'command').required(),
            amount: Joi.number().integer().positive().required(), occurredAt: Joi.date().iso().required(), createdAt: Joi.date().iso()
        });
    }
};
