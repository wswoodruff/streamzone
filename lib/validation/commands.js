'use strict';

const Joi = require('@hapi/joi');
const { CHAT_ROLES } = require('../runtime/chat-roles');

const fields = {
    name: Joi.string().lowercase().pattern(/^[a-z0-9][a-z0-9_-]*$/).max(50),
    responseTemplate: Joi.string().trim().min(1).max(1000),
    enabled: Joi.boolean(),
    cooldownSeconds: Joi.number().integer().min(0).max(86400),
    cooldownScope: Joi.string().valid('global', 'streamer', 'session', 'participant'),
    requiredChatRole: Joi.string().valid(...CHAT_ROLES)
};

exports.payload = Joi.object(fields).fork(['name', 'responseTemplate'], (schema) => schema.required());
exports.patchPayload = Joi.object(fields).min(1);
