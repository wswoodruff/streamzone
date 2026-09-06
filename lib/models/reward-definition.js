'use strict';

const Joi = require('@hapi/joi');
const Schwifty = require('@hapipal/schwifty');

module.exports = class RewardDefinition extends Schwifty.Model {
    static get tableName() { return 'RewardDefinition'; }
    static get jsonAttributes() { return ['eligibilityPolicy']; }
    static get joiSchema() {
        return Joi.object({
            id: Joi.number().integer().positive(), streamerId: Joi.number().integer().positive().required(),
            name: Joi.string().trim().min(1).max(120).required(), description: Joi.string().allow('').max(2000).default(''),
            pointCost: Joi.number().integer().positive().required(), enabled: Joi.boolean().default(true),
            fulfillmentType: Joi.string().valid('deterministicBot', 'manual', 'ai').required(),
            perUserCooldownSeconds: Joi.number().integer().min(0).allow(null), globalCooldownSeconds: Joi.number().integer().min(0).allow(null),
            perStreamLimit: Joi.number().integer().positive().allow(null),
            eligibilityPolicy: Joi.object({ membership: Joi.string().valid('any', 'member', 'nonMember').default('any'), providers: Joi.array().items(Joi.string().trim().min(1).max(40)).unique().default([]) }).default(),
            createdAt: Joi.date().iso(), updatedAt: Joi.date().iso()
        });
    }
};
