'use strict';
const Joi = require('@hapi/joi');
const Schwifty = require('@hapipal/schwifty');
module.exports = class ProviderCredential extends Schwifty.Model {
    static get tableName() { return 'ProviderCredential'; }
    static get idColumn() { return 'providerConnectionId'; }
    static get joiSchema() { return Joi.object({ providerConnectionId: Joi.number().integer().positive().required(), accessTokenCiphertext: Joi.string().required(), refreshTokenCiphertext: Joi.string().allow(null), keyVersion: Joi.string().max(40).required(), createdAt: Joi.date().iso(), updatedAt: Joi.date().iso() }); }
    $formatJson(json) { json = super.$formatJson(json); delete json.accessTokenCiphertext; delete json.refreshTokenCiphertext; return json; }
};
