'use strict';

const ManagementResponse = require('../../http/management-response');

const Joi = require('@hapi/joi');
const id = require('../../validation/ids');
const { patchPayload } = require('../../validation/streams');

module.exports = {
    method: 'PATCH',
    path: '/streams/{streamId}',
    options: { auth: 'session', validate: { params: Joi.object({ streamId: id.required() }), payload: patchPayload } },
    handler: async (request, h) => {
        try {
            const stream = await request.services().streamingService.updateStream(request.auth.credentials.id, request.params.streamId, 'manageStreams', request.payload);
            return stream || h.response({ message: 'Stream not found' }).code(404);
        }
        catch (error) {
            return ManagementResponse.fromError(error, h);
        }
    }
};
