'use strict';

const Joi = require('@hapi/joi');
const Schwifty = require('@hapipal/schwifty');
const { roles } = require('./streamer-membership');

module.exports = class StreamerInvitation extends Schwifty.Model {
    static get tableName() { return 'StreamerInvitation'; }

    static get joiSchema() {
        return Joi.object({
            id: Joi.number().integer().positive(),
            streamerId: Joi.number().integer().positive().required(),
            inviteeEmail: Joi.string().email().max(254).lowercase().required(),
            role: Joi.string().valid(...roles).required(),
            inviterUserId: Joi.number().integer().positive().required(),
            tokenHash: Joi.string().hex().length(64).required(),
            expiresAt: Joi.date().iso().required(),
            acceptedAt: Joi.date().iso().allow(null),
            revokedAt: Joi.date().iso().allow(null),
            createdAt: Joi.date().iso()
        });
    }

    static get relationMappings() {
        const Streamer = require('./streamer');
        const User = require('./user');
        return {
            streamer: { relation: Schwifty.Model.BelongsToOneRelation, modelClass: Streamer, join: { from: 'StreamerInvitation.streamerId', to: 'Streamer.id' } },
            inviter: { relation: Schwifty.Model.BelongsToOneRelation, modelClass: User, join: { from: 'StreamerInvitation.inviterUserId', to: 'User.id' } }
        };
    }

    $formatJson(json) {
        json = super.$formatJson(json);
        delete json.tokenHash;
        return json;
    }
};
