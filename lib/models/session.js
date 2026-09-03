'use strict';

const Joi = require('@hapi/joi');
const Schwifty = require('@hapipal/schwifty');

module.exports = class Session extends Schwifty.Model {
    static get tableName() {
        return 'sessions';
    }

    static get idColumn() {
        return 'id';
    }

    static get joiSchema() {
        return Joi.object({
            id: Joi.string().hex().length(64).required(),
            userId: Joi.number().integer().positive().required(),
            expiresAt: Joi.date().iso().required(),
            createdAt: Joi.date().iso()
        });
    }

    static get relationMappings() {
        const User = require('./user');

        return {
            user: {
                relation: Schwifty.Model.BelongsToOneRelation,
                modelClass: User,
                join: { from: 'sessions.userId', to: 'users.id' }
            }
        };
    }
};
