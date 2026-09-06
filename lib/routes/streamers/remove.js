'use strict';

const ManagementResponse = require('../../http/management-response');

const Joi = require('@hapi/joi');
const id = require('../../validation/ids');

module.exports = {
    method: 'DELETE',
    path: '/streamers/{streamerId}',
    options: { auth: 'session', validate: { params: Joi.object({ streamerId: id.required() }) } },
    handler: async (request, h) => {
        try {
            const deleted = await request.services().streamingService.deleteStreamer(request.auth.credentials.id, request.params.streamerId, 'deleteStreamer');
            return deleted ? h.response().code(204) : h.response({ message: 'Streamer not found' }).code(404);
        }
        catch (error) {
            return ManagementResponse.fromError(error, h);
        }
    }
};
