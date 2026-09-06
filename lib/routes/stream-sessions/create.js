'use strict';

const ManagementResponse = require('../../http/management-response');
const Joi = require('@hapi/joi');
const id = require('../../validation/ids');
const { payload } = require('../../validation/stream-sessions');

module.exports = {
    method: 'POST',
    path: '/streamers/{streamerId}/stream-sessions',
    options: { auth: 'session', validate: { params: Joi.object({ streamerId: id.required() }), payload } },
    handler: async (request, h) => {
        try {
            const session = await request.services().streamingService.createStreamSession(
                request.auth.credentials.id,
                request.params.streamerId,
                'manageStreams',
                request.payload
            );
            return h.response(session).code(201);
        }
        catch (error) {
            return ManagementResponse.fromError(error, h);
        }
    }
};
