'use strict';

const Joi = require('@hapi/joi');
const Schwifty = require('@hapipal/schwifty');

const providers = ['youtube', 'twitch'];

module.exports = class Source extends Schwifty.Model {
    static get tableName() {
        return 'Source';
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
        const ChannelRelationship = require('./channel-relationship');

        return {
            streamer: {
                relation: Schwifty.Model.BelongsToOneRelation,
                modelClass: Streamer,
                join: {
                    from: 'Source.streamerId',
                    to: 'Streamer.id'
                }
            },
            streams: {
                relation: Schwifty.Model.HasManyRelation,
                modelClass: Stream,
                join: {
                    from: 'Source.id',
                    to: 'Stream.sourceId'
                }
            },
            channelRelationships: {
                relation: Schwifty.Model.HasManyRelation,
                modelClass: ChannelRelationship,
                join: { from: 'Source.id', to: 'ChannelRelationship.sourceId' }
            }
        };
    }
};

module.exports.providers = providers;
