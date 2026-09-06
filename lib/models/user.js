'use strict';

const Joi = require('@hapi/joi');
const Schwifty = require('@hapipal/schwifty');

module.exports = class User extends Schwifty.Model {
    static get tableName() {
        return 'users';
    }

    static get joiSchema() {
        return Joi.object({
            id: Joi.number().integer().positive(),
            email: Joi.string().email().max(254).required(),
            displayName: Joi.string().trim().min(1).max(120).required(),
            passwordHash: Joi.string().max(255).required(),
            createdAt: Joi.date().iso()
        });
    }

    static get relationMappings() {
        const StreamerMembership = require('./streamer-membership');

        return {
            memberships: {
                relation: Schwifty.Model.HasManyRelation,
                modelClass: StreamerMembership,
                join: { from: 'users.id', to: 'streamerMemberships.userId' }
            }
        };
    }

    $formatJson(json) {
        json = super.$formatJson(json);
        delete json.passwordHash;
        return json;
    }
};
