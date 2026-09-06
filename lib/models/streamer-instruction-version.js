'use strict';

const Joi = require('@hapi/joi');
const Schwifty = require('@hapipal/schwifty');

module.exports = class StreamerInstructionVersion extends Schwifty.Model {
    static get tableName() { return 'StreamerInstructionVersion'; }
    static get joiSchema() { return Joi.object({ id: Joi.number().integer().positive(), streamerId: Joi.number().integer().positive().required(), instruction: Joi.string().max(4000).required(), createdAt: Joi.date().iso() }); }
};
