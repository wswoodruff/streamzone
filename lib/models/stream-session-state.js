'use strict';

const Joi = require('@hapi/joi');
const Schwifty = require('@hapipal/schwifty');

// This model is infrastructure-only. Feature code must use StreamSessionStateService,
// which owns namespace isolation, quotas, serialization and concurrency control.
module.exports = class StreamSessionState extends Schwifty.Model {
    static get tableName() { return 'StreamSessionState'; }

    static get joiSchema() {
        return Joi.object({
            id: Joi.number().integer().positive(),
            streamSessionId: Joi.number().integer().positive().required(),
            namespace: Joi.string().min(1).max(100).required(),
            key: Joi.string().min(1).max(160).required(),
            serializedValue: Joi.string().required(),
            sizeBytes: Joi.number().integer().min(0).required(),
            version: Joi.number().integer().positive().required(),
            purpose: Joi.string().trim().min(1).max(255).allow(null),
            expiresAt: Joi.date().iso().allow(null),
            createdAt: Joi.date().iso(),
            updatedAt: Joi.date().iso()
        });
    }

    static get relationMappings() {
        const StreamSession = require('./stream-session');
        return {
            streamSession: {
                relation: Schwifty.Model.BelongsToOneRelation,
                modelClass: StreamSession,
                join: { from: 'StreamSessionState.streamSessionId', to: 'StreamSession.id' }
            }
        };
    }
};
