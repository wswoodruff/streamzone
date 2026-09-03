'use strict';

const Joi = require('@hapi/joi');
const Schwifty = require('@hapipal/schwifty');

const providers = ['youtube', 'twitch'];

module.exports = class Source extends Schwifty.Model {
    static get tableName() {
        return 'sources';
    }

    static get joiSchema() {
        return Joi.object({
            id: Joi.number().integer().positive(),
            streamerId: Joi.number().integer().positive().required(),
            provider: Joi.string().valid(...providers).required(),
            channelId: Joi.string().trim().min(1).max(255).required(),
            enabled: Joi.boolean().default(true),
            createdAt: Joi.date().iso()
        });
    }

    static get relationMappings() {
        const Streamer = require('./streamer');
        const Stream = require('./stream');

        return {
            streamer: {
                relation: Schwifty.Model.BelongsToOneRelation,
                modelClass: Streamer,
                join: {
                    from: 'sources.streamerId',
                    to: 'streamers.id'
                }
            },
            streams: {
                relation: Schwifty.Model.HasManyRelation,
                modelClass: Stream,
                join: {
                    from: 'sources.id',
                    to: 'streams.sourceId'
                }
            }
        };
    }
};

module.exports.providers = providers;

