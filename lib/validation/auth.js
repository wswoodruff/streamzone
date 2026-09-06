'use strict';

const Joi = require('@hapi/joi');

exports.credentials = Joi.object({
    email: Joi.string().email().max(254).required(),
    password: Joi.string().min(10).max(128).required()
});
exports.next = Joi.object({ next: Joi.string().max(500) });
