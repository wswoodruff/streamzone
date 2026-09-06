'use strict';

const Joi = require('@hapi/joi');
const Schwifty = require('@hapipal/schwifty');

module.exports = class RewardExecutorConfiguration extends Schwifty.Model {
    static get tableName() { return 'RewardExecutorConfiguration'; }
    static get idColumn() { return 'rewardDefinitionId'; }
    static get jsonAttributes() { return ['configuration']; }
    static get joiSchema() { return Joi.object({ rewardDefinitionId: Joi.number().integer().positive().required(), configuration: Joi.object().required(), updatedAt: Joi.date().iso() }); }
};
