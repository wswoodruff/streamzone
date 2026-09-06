'use strict';

const Joi = require('@hapi/joi');
const Schwifty = require('@hapipal/schwifty');

module.exports = class AiInvocation extends Schwifty.Model {
    static get tableName() { return 'AiInvocation'; }
    static get joiSchema() {
        return Joi.object({
            id: Joi.number().integer().positive(), streamerId: Joi.number().integer().positive().required(),
            streamSessionId: Joi.number().integer().positive().required(), chatUserId: Joi.number().integer().positive().required(),
            chatIdentityId: Joi.number().integer().positive().required(), configurationVersion: Joi.string().max(120).required(),
            instructionVersionId: Joi.number().integer().positive().required(), idempotencyKey: Joi.string().max(255).required(),
            quotedPointCost: Joi.number().integer().positive().required(),
            status: Joi.string().valid('reserved', 'dispatching', 'succeeded', 'rejected', 'cooldown', 'insufficient_balance', 'timed_out', 'provider_failed', 'unsafe_output', 'cancelled', 'delivery_failed').required(),
            reservationStatus: Joi.string().valid('reserved', 'committed', 'released').required(), reasonCode: Joi.string().max(80).allow(null),
            usageMetadata: Joi.object().allow(null), reservationLedgerEntryId: Joi.number().integer().positive().required(),
            createdAt: Joi.date().iso(), updatedAt: Joi.date().iso(), startedAt: Joi.date().iso().allow(null), completedAt: Joi.date().iso().allow(null)
        });
    }
};
