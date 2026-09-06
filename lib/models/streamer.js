'use strict';

const Joi = require('@hapi/joi');
const Schwifty = require('@hapipal/schwifty');

module.exports = class Streamer extends Schwifty.Model {
    static get tableName() {
        return 'Streamer';
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
        const Command = require('./command');
        const StreamerMembership = require('./streamer-membership');
        const StreamerInvitation = require('./streamer-invitation');
        const StreamSession = require('./stream-session');

        return {
            sources: {
                relation: Schwifty.Model.HasManyRelation,
                modelClass: Source,
                join: {
                    from: 'Streamer.id',
                    to: 'Source.streamerId'
                }
            },
            streamSessions: {
                relation: Schwifty.Model.HasManyRelation,
                modelClass: StreamSession,
                join: {
                    from: 'Streamer.id',
                    to: 'StreamSession.streamerId'
                }
            },
            commands: {
                relation: Schwifty.Model.HasManyRelation,
                modelClass: Command,
                join: {
                    from: 'Streamer.id',
                    to: 'Command.streamerId'
                }
            },
            memberships: {
                relation: Schwifty.Model.HasManyRelation,
                modelClass: StreamerMembership,
                join: {
                    from: 'Streamer.id',
                    to: 'StreamerMembership.streamerId'
                }
            },
            invitations: {
                relation: Schwifty.Model.HasManyRelation,
                modelClass: StreamerInvitation,
                join: { from: 'Streamer.id', to: 'StreamerInvitation.streamerId' }
            }
        };
    }
};
