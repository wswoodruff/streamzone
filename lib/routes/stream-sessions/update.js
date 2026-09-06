'use strict';

const ManagementResponse = require('../../http/management-response');
const Joi = require('@hapi/joi');
const id = require('../../validation/ids');
const { patchPayload } = require('../../validation/stream-sessions');

module.exports = {
    method: 'PATCH',
    path: '/streamers/{streamerId}/stream-sessions/{streamSessionId}',
    options: {
        auth: 'session',
        validate: {
            params: Joi.object({ streamerId: id.required(), streamSessionId: id.required() }),
            payload: patchPayload
        }
    },
    handler: async (request, h) => {
        try {
            return await request.services().streamingService.updateStreamSession(
                request.auth.credentials.id,
                request.params.streamerId,
                request.params.streamSessionId,
                'manageStreams',
                request.payload
            );
        }
        catch (error) {
            return ManagementResponse.fromError(error, h);
        }
    }
};
