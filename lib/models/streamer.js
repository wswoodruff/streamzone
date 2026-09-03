'use strict';

const Joi = require('@hapi/joi');
const Schwifty = require('@hapipal/schwifty');

module.exports = class Streamer extends Schwifty.Model {
    static get tableName() {
        return 'streamers';
    }

    static get joiSchema() {
        return Joi.object({
            id: Joi.number().integer().positive(),
            slug: Joi.string().lowercase().pattern(/^[a-z0-9-]+$/).max(80).required(),
            displayName: Joi.string().trim().min(1).max(120).required(),
            createdAt: Joi.date().iso()
        });
    }

    static get relationMappings() {
        const Source = require('./source');

        return {
            sources: {
                relation: Schwifty.Model.HasManyRelation,
                modelClass: Source,
                join: {
                    from: 'streamers.id',
                    to: 'sources.streamerId'
                }
            }
        };
    }
};

