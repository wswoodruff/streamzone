'use strict';
const Joi = require('@hapi/joi');
const Schwifty = require('@hapipal/schwifty');
module.exports = class ExternalLoginIdentity extends Schwifty.Model {
    static get tableName() { return 'ExternalLoginIdentity'; }
    static get joiSchema() { return Joi.object({ id: Joi.number().integer().positive(), provider: Joi.string().max(40).required(), providerSubject: Joi.string().max(255).required(), userId: Joi.number().integer().positive().required(), createdAt: Joi.date().iso(), updatedAt: Joi.date().iso() }); }
    static get relationMappings() { const User = require('./user'); return { user: { relation: Schwifty.Model.BelongsToOneRelation, modelClass: User, join: { from: 'ExternalLoginIdentity.userId', to: 'User.id' } } }; }
};
