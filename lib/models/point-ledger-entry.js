'use strict';

const Joi = require('@hapi/joi');
const Schwifty = require('@hapipal/schwifty');

module.exports = class PointLedgerEntry extends Schwifty.Model {
    static get tableName() { return 'PointLedgerEntry'; }
    static get joiSchema() {
        return Joi.object({
            id: Joi.number().integer().positive(), accountId: Joi.number().integer().positive().required(),
            earningPolicyId: Joi.number().integer().positive().allow(null), streamSessionId: Joi.number().integer().positive().allow(null),
            relatedExecutionId: Joi.string().max(255).allow(null), delta: Joi.number().integer().required(),
            type: Joi.string().valid('award', 'reserve', 'spend', 'refund', 'adjustment').required(),
            reason: Joi.string().max(255).required(), actorType: Joi.string().valid('system', 'moderator', 'user').required(),
            actorId: Joi.string().max(255).required(), idempotencyKey: Joi.string().max(255).required(), createdAt: Joi.date().iso()
        });
    }
};
