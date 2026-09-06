'use strict';

const ManagementResponse = require('../../http/management-response');

const Joi = require('@hapi/joi');
const id = require('../../validation/ids');

module.exports = {
    method: 'DELETE',
    path: '/streams/{streamId}',
    options: { auth: 'session', validate: { params: Joi.object({ streamId: id.required() }) } },
    handler: async (request, h) => {
        try {
            const deleted = await request.services().streamingService.deleteStream(request.auth.credentials.id, request.params.streamId, 'manageStreams');
            return deleted ? h.response().code(204) : h.response({ message: 'Stream not found' }).code(404);
        }
        catch (error) {
            return ManagementResponse.fromError(error, h);
        }
    }
};
