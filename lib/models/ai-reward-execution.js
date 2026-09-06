'use strict';

const Joi = require('@hapi/joi');
const Schwifty = require('@hapipal/schwifty');

module.exports = class AiRewardExecution extends Schwifty.Model {
    static get tableName() { return 'AiRewardExecution'; }
    static get joiSchema() {
        return Joi.object({
            id: Joi.number().integer().positive(), redemptionId: Joi.number().integer().positive().required(),
            streamerId: Joi.number().integer().positive().required(), chatUserId: Joi.number().integer().positive().required(),
            streamSessionId: Joi.number().integer().positive().allow(null), provider: Joi.string().max(80).required(), model: Joi.string().max(160).required(),
            platformPolicyVersionId: Joi.string().max(120).allow(null), streamerInstructionVersionId: Joi.number().integer().positive().allow(null),
            status: Joi.string().valid('dispatching', 'succeeded', 'refused', 'timed_out', 'provider_error', 'moderated').required(),
            pointCost: Joi.number().integer().positive().required(),
            inputTokenCount: Joi.number().integer().min(0).allow(null), outputTokenCount: Joi.number().integer().min(0).allow(null),
            estimatedProviderCost: Joi.number().integer().min(0).allow(null), reservedCostMicros: Joi.number().integer().min(0).required(),
            latencyMs: Joi.number().integer().min(0).allow(null), errorCode: Joi.string().max(80).allow(null),
            errorCategory: Joi.string().max(40).allow(null), createdAt: Joi.date().iso(), completedAt: Joi.date().iso().allow(null)
        });
    }
};
