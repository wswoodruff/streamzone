'use strict';

const Joi = require('@hapi/joi');
const Schwifty = require('@hapipal/schwifty');

const statuses = ['scheduled', 'live', 'offline'];

module.exports = class Stream extends Schwifty.Model {
    static get tableName() {
        return 'streams';
    }

    static get joiSchema() {
        return Joi.object({
            id: Joi.number().integer().positive(),
            sourceId: Joi.number().integer().positive().required(),
            externalId: Joi.string().trim().max(255).allow(null),
            title: Joi.string().trim().max(255).allow(null),
            status: Joi.string().valid(...statuses).required(),
            startedAt: Joi.date().iso().allow(null),
            endedAt: Joi.date().iso().allow(null),
            createdAt: Joi.date().iso()
        });
    }

    static get relationMappings() {
        const Source = require('./source');

        return {
            source: {
                relation: Schwifty.Model.BelongsToOneRelation,
                modelClass: Source,
                join: {
                    from: 'streams.sourceId',
                    to: 'sources.id'
                }
            }
        };
    }
};

module.exports.statuses = statuses;

