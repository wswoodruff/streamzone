'use strict';

const Joi = require('@hapi/joi');
const Schwifty = require('@hapipal/schwifty');

module.exports = class AiFeatureConfiguration extends Schwifty.Model {
    static get tableName() { return 'AiFeatureConfiguration'; }
    static get idColumn() { return 'streamerId'; }
    static get jsonAttributes() { return ['pricingPolicy']; }
    static get joiSchema() {
        return Joi.object({
            streamerId: Joi.number().integer().positive().required(),
            enabled: Joi.boolean().default(false),
            invocationCommand: Joi.string().lowercase().pattern(/^[a-z0-9][a-z0-9_-]*$/).max(50).default('ai'),
            provider: Joi.string().trim().min(1).max(80).allow(null),
            model: Joi.string().trim().min(1).max(160).allow(null),
            configurationVersion: Joi.string().trim().min(1).max(120).required(),
            pricingPolicy: Joi.object({
                type: Joi.string().valid('fixed').required(),
                pointCost: Joi.number().integer().positive().required()
            }).required(),
            cooldownSeconds: Joi.number().integer().min(0).max(86400).default(0),
            cooldownScope: Joi.string().valid('global', 'streamer', 'session', 'participant').default('participant'),
            maxInputChars: Joi.number().integer().min(1).max(12000).default(2000),
            maxOutputChars: Joi.number().integer().min(1).max(12000).default(2000),
            maxOutputTokenCount: Joi.number().integer().min(1).max(4096).default(512),
            timeoutMs: Joi.number().integer().min(100).max(30000).default(5000),
            updatedAt: Joi.date().iso()
        });
    }
};
