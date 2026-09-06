'use strict';

const Joi = require('@hapi/joi');
const id = require('../../validation/ids');

module.exports = {
    method: 'GET',
    path: '/streamers/{streamerId}/commands',
    options: {
        auth: 'session',
        validate: {
            params: Joi.object({ streamerId: id.required() }),
            query: Joi.object({ includeDisabled: Joi.boolean().default(false) })
        }
    },
    handler: async (request, h) => {
        const commands = await request.services().streamingService.listCommands(request.params.streamerId, request.query);
        return commands || h.response({ message: 'Streamer not found' }).code(404);
    }
};
