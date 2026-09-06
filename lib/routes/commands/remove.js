'use strict';

const Joi = require('@hapi/joi');
const id = require('../../validation/ids');

module.exports = {
    method: 'DELETE',
    path: '/streamers/{streamerId}/commands/{commandId}',
    options: {
        auth: 'session',
        validate: { params: Joi.object({ streamerId: id.required(), commandId: id.required() }) }
    },
    handler: async (request, h) => {
        const deleted = await request.services().streamingService.deleteCommand(request.params.streamerId, request.params.commandId);
        return deleted ? h.response().code(204) : h.response({ message: 'Command not found' }).code(404);
    }
};
