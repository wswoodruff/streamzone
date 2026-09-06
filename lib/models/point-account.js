'use strict';

const Joi = require('@hapi/joi');
const Schwifty = require('@hapipal/schwifty');

module.exports = class PointAccount extends Schwifty.Model {
    static get tableName() { return 'PointAccount'; }
    static get joiSchema() {
        return Joi.object({
            id: Joi.number().integer().positive(), streamerId: Joi.number().integer().positive().required(),
            chatUserId: Joi.number().integer().positive().required(), availableBalance: Joi.number().integer().min(0),
            lifetimeEarned: Joi.number().integer().min(0), lifetimeSpent: Joi.number().integer().min(0),
            createdAt: Joi.date().iso(), updatedAt: Joi.date().iso()
        });
    }
};
