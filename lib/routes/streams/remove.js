'use strict';

const Joi = require('@hapi/joi');
const id = require('../../validation/ids');

module.exports = {
    method: 'DELETE',
    path: '/streams/{streamId}',
    options: { auth: 'session', validate: { params: Joi.object({ streamId: id.required() }) } },
    handler: async (request, h) => {
        const deleted = await request.services().streamingService.deleteStream(request.params.streamId);
        return deleted ? h.response().code(204) : h.response({ message: 'Stream not found' }).code(404);
    }
};
