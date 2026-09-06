'use strict';

const Joi = require('@hapi/joi');
const Schwifty = require('@hapipal/schwifty');

module.exports = class AiFeatureConfiguration extends Schwifty.Model {
    static get tableName() { return 'AiFeatureConfiguration'; }
    static get idColumn() { return 'rewardDefinitionId'; }
    static get jsonAttributes() { return ['pricingPolicy']; }
    static get joiSchema() {
        return Joi.object({
            rewardDefinitionId: Joi.number().integer().positive().required(),
            pricingPolicy: Joi.object({ type: Joi.string().valid('fixed').required(), pointCost: Joi.number().integer().positive().required() }).required(),
            updatedAt: Joi.date().iso()
        });
    }
};
