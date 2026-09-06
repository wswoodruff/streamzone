'use strict';

const Joi = require('@hapi/joi');

const payload = Joi.object({
    slug: Joi.string().lowercase().pattern(/^[a-z0-9-]+$/).max(80).required(),
    displayName: Joi.string().trim().min(1).max(120).required()
});

exports.payload = payload;
exports.patchPayload = payload.fork(['slug', 'displayName'], (schema) => schema.optional()).min(1);
