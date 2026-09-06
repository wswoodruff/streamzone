'use strict';

const Joi = require('@hapi/joi');

const policy = Joi.object({ membership: Joi.string().valid('any', 'member', 'nonMember').default('any'), providers: Joi.array().items(Joi.string().lowercase().max(40)).unique().default([]) });
const fields = {
    name: Joi.string().trim().min(1).max(120), description: Joi.string().allow('').max(2000), pointCost: Joi.number().integer().positive(), enabled: Joi.boolean(),
    fulfillmentType: Joi.string().valid('deterministicBot', 'manual', 'ai'), perUserCooldownSeconds: Joi.number().integer().min(0).allow(null),
    globalCooldownSeconds: Joi.number().integer().min(0).allow(null), perStreamLimit: Joi.number().integer().positive().allow(null), eligibilityPolicy: policy,
    executorConfiguration: Joi.object()
};
exports.create = Joi.object({ ...fields, name: fields.name.required(), pointCost: fields.pointCost.required(), fulfillmentType: fields.fulfillmentType.required() });
exports.update = Joi.object(fields).min(1);
exports.participant = Joi.object({ chatUserId: Joi.number().integer().positive().required(), provider: Joi.string().lowercase().max(40) });
exports.redeem = Joi.object({ chatUserId: Joi.number().integer().positive().required(), rewardDefinitionId: Joi.number().integer().positive().required(), streamSessionId: Joi.number().integer().positive().allow(null), provider: Joi.string().lowercase().max(40), idempotencyKey: Joi.string().trim().min(1).max(255).required() });
