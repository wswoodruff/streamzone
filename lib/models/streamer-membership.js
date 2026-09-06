'use strict';

const Joi = require('@hapi/joi');
const Schwifty = require('@hapipal/schwifty');

const roles = ['owner', 'admin', 'editor', 'viewer'];

module.exports = class StreamerMembership extends Schwifty.Model {
    static get tableName() {
        return 'streamerMemberships';
    }

    static get idColumn() {
        return ['userId', 'streamerId'];
    }

    static get joiSchema() {
        return Joi.object({
            userId: Joi.number().integer().positive().required(),
            streamerId: Joi.number().integer().positive().required(),
            role: Joi.string().valid(...roles).required(),
            createdAt: Joi.date().iso(),
            updatedAt: Joi.date().iso()
        });
    }

    static get relationMappings() {
        const User = require('./user');
        const Streamer = require('./streamer');

        return {
            user: {
                relation: Schwifty.Model.BelongsToOneRelation,
                modelClass: User,
                join: { from: 'streamerMemberships.userId', to: 'users.id' }
            },
            streamer: {
                relation: Schwifty.Model.BelongsToOneRelation,
                modelClass: Streamer,
                join: { from: 'streamerMemberships.streamerId', to: 'streamers.id' }
            }
        };
    }
};

module.exports.roles = roles;
