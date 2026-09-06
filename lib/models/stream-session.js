'use strict';

const Joi = require('@hapi/joi');
const Schwifty = require('@hapipal/schwifty');

const statuses = ['scheduled', 'live', 'ended'];

module.exports = class StreamSession extends Schwifty.Model {
    static get tableName() {
        return 'StreamSession';
    }

    static get joiSchema() {
        return Joi.object({
            id: Joi.number().integer().positive(),
            streamerId: Joi.number().integer().positive().required(),
            title: Joi.string().trim().min(1).max(255).required(),
            status: Joi.string().valid(...statuses).required(),
            scheduledAt: Joi.date().iso().allow(null),
            startedAt: Joi.date().iso().allow(null),
            endedAt: Joi.date().iso().allow(null),
            publicMetadata: Joi.object().unknown(true).allow(null),
            createdAt: Joi.date().iso(),
            updatedAt: Joi.date().iso()
        });
    }

    static get relationMappings() {
        const Streamer = require('./streamer');
        const Stream = require('./stream');
        const StreamSessionState = require('./stream-session-state');

        return {
            streamer: {
                relation: Schwifty.Model.BelongsToOneRelation,
                modelClass: Streamer,
                join: { from: 'StreamSession.streamerId', to: 'Streamer.id' }
            },
            streams: {
                relation: Schwifty.Model.HasManyRelation,
                modelClass: Stream,
                join: { from: 'StreamSession.id', to: 'Stream.streamSessionId' }
            },
            state: {
                relation: Schwifty.Model.HasManyRelation,
                modelClass: StreamSessionState,
                join: { from: 'StreamSession.id', to: 'StreamSessionState.streamSessionId' }
            }
        };
    }
};

module.exports.statuses = statuses;
