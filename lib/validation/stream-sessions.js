'use strict';

const Joi = require('@hapi/joi');

const fields = {
    title: Joi.string().trim().min(1).max(255),
    status: Joi.string().valid('scheduled', 'live', 'ended'),
    scheduledAt: Joi.date().iso().allow(null),
    startedAt: Joi.date().iso().allow(null),
    endedAt: Joi.date().iso().allow(null),
    publicMetadata: Joi.object().unknown(true).allow(null)
};

exports.payload = Joi.object(fields)
    .fork(['title'], (schema) => schema.required())
    .fork(['status'], (schema) => schema.default('scheduled'))
    .fork(['scheduledAt', 'startedAt', 'endedAt', 'publicMetadata'], (schema) => schema.default(null));
exports.patchPayload = Joi.object(fields).min(1);
