'use strict';

const Joi = require('@hapi/joi');
const id = require('../../validation/ids');

module.exports = {
    method: 'DELETE',
    path: '/streamers/{streamerId}',
    options: { auth: 'session', validate: { params: Joi.object({ streamerId: id.required() }) } },
    handler: async (request, h) => {
        const deleted = await request.services().streamingService.deleteStreamer(request.params.streamerId);
        return deleted ? h.response().code(204) : h.response({ message: 'Streamer not found' }).code(404);
    }
};
