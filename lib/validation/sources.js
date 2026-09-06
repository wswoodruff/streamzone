'use strict';

const Joi = require('@hapi/joi');

exports.payload = Joi.object({
    provider: Joi.string().valid('youtube', 'twitch').required(),
    channelId: Joi.string().trim().min(1).max(255).required(),
    enabled: Joi.boolean().default(true)
});
