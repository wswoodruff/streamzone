'use strict';

const Joi = require('@hapi/joi');
const id = require('./ids');

const mutableFields = {
    sourceId: id,
    externalId: Joi.string().trim().max(255).allow(null),
    title: Joi.string().trim().max(255).allow(null),
    status: Joi.string().valid('scheduled', 'live', 'offline'),
    startedAt: Joi.date().iso().allow(null),
    endedAt: Joi.date().iso().allow(null)
};

exports.payload = Joi.object({ ...mutableFields, streamSessionId: id })
    .fork(['sourceId', 'streamSessionId'], (schema) => schema.required())
    .fork(['externalId', 'title', 'startedAt', 'endedAt'], (schema) => schema.default(null))
    .fork(['status'], (schema) => schema.default('scheduled'));
exports.patchPayload = Joi.object(mutableFields).min(1);
exports.status = mutableFields.status;
