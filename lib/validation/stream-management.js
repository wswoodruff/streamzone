'use strict';

const Joi = require('@hapi/joi');
const id = require('./ids');

const optionalText = Joi.string().trim().max(255).allow('');

exports.query = Joi.object({
    streamerId: id,
    notice: Joi.string().max(255),
    error: Joi.string().max(255)
});

exports.sourcePayload = Joi.object({
    streamerId: id.required(),
    provider: Joi.string().valid('youtube', 'twitch').required(),
    channelId: Joi.string().trim().min(1).max(255).required()
});

exports.sessionPayload = Joi.object({
    streamerId: id.required(),
    title: Joi.string().trim().min(1).max(255).required(),
    scheduledAt: Joi.string().trim().pattern(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/).allow('').default('')
});

exports.streamPayload = Joi.object({
    streamerId: id.required(),
    sourceId: id.required(),
    streamSessionId: id.required(),
    externalId: optionalText.default(''),
    title: optionalText.default(''),
    status: Joi.string().valid('scheduled', 'live', 'offline').default('scheduled')
});

exports.lifecyclePayload = Joi.object({
    streamerId: id.required(),
    action: Joi.string().valid('start', 'end').required()
});
