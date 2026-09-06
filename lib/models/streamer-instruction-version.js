'use strict';

const Joi = require('@hapi/joi');
const Schwifty = require('@hapipal/schwifty');

module.exports = class StreamerInstructionVersion extends Schwifty.Model {
    static get tableName() { return 'StreamerInstructionVersion'; }
    static get jsonAttributes() { return ['findings']; }
    static get joiSchema() { return Joi.object({
        id: Joi.number().integer().positive(), streamerId: Joi.number().integer().positive().required(), instruction: Joi.string().max(4000).required(),
        status: Joi.string().valid('draft', 'approved', 'rejected', 'active', 'superseded'), revision: Joi.number().integer().positive(),
        validatedRevision: Joi.number().integer().positive().allow(null), findings: Joi.array().items(Joi.object()).allow(null),
        policyVersion: Joi.string().max(120).allow(null), checkerVersion: Joi.string().max(120).allow(null),
        createdBy: Joi.number().integer().positive().allow(null), reviewedBy: Joi.number().integer().positive().allow(null), publishedBy: Joi.number().integer().positive().allow(null),
        basedOnVersionId: Joi.number().integer().positive().allow(null), validationRequestedAt: Joi.date().iso().allow(null), reviewedAt: Joi.date().iso().allow(null),
        warningsAcknowledgedAt: Joi.date().iso().allow(null), warningsAcknowledgedBy: Joi.number().integer().positive().allow(null), publishedAt: Joi.date().iso().allow(null),
        supersededAt: Joi.date().iso().allow(null), createdAt: Joi.date().iso(), updatedAt: Joi.date().iso()
    }); }
};
