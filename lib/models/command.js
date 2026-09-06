'use strict';

const Joi = require('@hapi/joi');
const Schwifty = require('@hapipal/schwifty');

module.exports = class Command extends Schwifty.Model {
    static get tableName() {
        return 'Command';
    }

    static get joiSchema() {
        return Joi.object({
            id: Joi.number().integer().positive(),
            streamerId: Joi.number().integer().positive().required(),
            name: Joi.string().lowercase().pattern(/^[a-z0-9][a-z0-9_-]*$/).max(50).required(),
            responseTemplate: Joi.string().trim().min(1).max(1000).required(),
            enabled: Joi.boolean().default(true),
            cooldownSeconds: Joi.number().integer().min(0).max(86400).default(0),
            createdAt: Joi.date().iso(),
            updatedAt: Joi.date().iso()
        });
    }

    static get relationMappings() {
        const Streamer = require('./streamer');

        return {
            streamer: {
                relation: Schwifty.Model.BelongsToOneRelation,
                modelClass: Streamer,
                join: { from: 'Command.streamerId', to: 'Streamer.id' }
            }
        };
    }
};
