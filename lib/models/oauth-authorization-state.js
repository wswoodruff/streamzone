'use strict';
const Joi = require('@hapi/joi');
const Schwifty = require('@hapipal/schwifty');
module.exports = class OAuthAuthorizationState extends Schwifty.Model {
    static get tableName() { return 'OAuthAuthorizationState'; }
    static get idColumn() { return 'stateHash'; }
    static get joiSchema() { return Joi.object({ stateHash: Joi.string().hex().length(64).required(), purpose: Joi.string().valid('dashboard_login', 'provider_connection').required(), provider: Joi.string().max(40).required(), userId: Joi.number().integer().positive().allow(null), streamerId: Joi.number().integer().positive().allow(null), pkceVerifier: Joi.string().max(128).required(), nonce: Joi.string().max(128).required(), expiresAt: Joi.date().iso().required(), consumedAt: Joi.date().iso().allow(null), createdAt: Joi.date().iso() }); }
    $formatJson(json) { json = super.$formatJson(json); delete json.pkceVerifier; delete json.stateHash; delete json.nonce; return json; }
};
