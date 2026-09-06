'use strict';

const ManagementResponse = require('../../http/management-response');

const { payload } = require('../../validation/streams');

module.exports = {
    method: 'POST',
    path: '/streams',
    options: { auth: 'session', validate: { payload } },
    handler: async (request, h) => {
        try {
            const stream = await request.services().streamingService.createStream(request.auth.credentials.id, 'manageStreams', request.payload);
            return stream ? h.response(stream).code(201) : h.response({ message: 'Source not found' }).code(404);
        }
        catch (error) {
            return ManagementResponse.fromError(error, h);
        }
    }
};
