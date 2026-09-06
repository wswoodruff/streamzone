'use strict';

const Joi = require('@hapi/joi');
const roles = ['owner', 'admin', 'editor', 'viewer'];

exports.rolePayload = Joi.object({ role: Joi.string().valid(...roles).required() });
exports.invitationPayload = Joi.object({
    email: Joi.string().email().max(254).required(),
    role: Joi.string().valid(...roles).required(),
    expiresAt: Joi.date().iso().greater('now')
});
exports.acceptPayload = Joi.object({ token: Joi.string().min(32).max(256).required() });
