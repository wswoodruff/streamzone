'use strict';

const Joi = require('@hapi/joi');
const Schwifty = require('@hapipal/schwifty');

module.exports = class EarningPolicy extends Schwifty.Model {
    static get tableName() { return 'EarningPolicy'; }
    static get joiSchema() {
        return Joi.object({
            id: Joi.number().integer().positive(), streamerId: Joi.number().integer().positive().required(),
            eventType: Joi.string().valid('participationInterval', 'commandOutcome', 'moderatorGrant').required(),
            name: Joi.string().max(120).required(), points: Joi.number().integer().positive().required(),
            perSessionCap: Joi.number().integer().positive().allow(null), perDayCap: Joi.number().integer().positive().allow(null),
            enabled: Joi.boolean(), createdAt: Joi.date().iso(), updatedAt: Joi.date().iso()
        });
    }
};
