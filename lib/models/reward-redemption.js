'use strict';

const Joi = require('@hapi/joi');
const Schwifty = require('@hapipal/schwifty');

module.exports = class RewardRedemption extends Schwifty.Model {
    static get tableName() { return 'RewardRedemption'; }
    static get joiSchema() {
        return Joi.object({
            id: Joi.number().integer().positive(), streamerId: Joi.number().integer().positive().required(), rewardDefinitionId: Joi.number().integer().positive().required(),
            chatUserId: Joi.number().integer().positive().required(), streamSessionId: Joi.number().integer().positive().allow(null), pointCost: Joi.number().integer().positive().required(),
            status: Joi.string().valid('requested', 'reserved', 'fulfilled', 'rejected', 'cancelled', 'refunded').required(), idempotencyKey: Joi.string().max(255).required(),
            failureCode: Joi.string().max(80).allow(null), failureDetails: Joi.string().max(2000).allow(null), createdAt: Joi.date().iso(), updatedAt: Joi.date().iso(), fulfilledAt: Joi.date().iso().allow(null)
        });
    }
};
