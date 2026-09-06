'use strict';

const ManagementResponse = require('../../http/management-response');

const Joi = require('@hapi/joi');
const id = require('../../validation/ids');
const { patchPayload } = require('../../validation/streamers');

module.exports = {
    method: 'PATCH',
    path: '/streamers/{streamerId}',
    options: { auth: 'session', validate: { params: Joi.object({ streamerId: id.required() }), payload: patchPayload } },
    handler: async (request, h) => {
        try {
            const streamer = await request.services().streamingService.updateStreamer(request.auth.credentials.id, request.params.streamerId, 'manageStreams', request.payload);
            return streamer || h.response({ message: 'Streamer not found' }).code(404);
        }
        catch (error) {
            return ManagementResponse.fromError(error, h);
        }
    }
};
