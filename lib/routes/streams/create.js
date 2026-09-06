'use strict';

const { payload } = require('../../validation/streams');

module.exports = {
    method: 'POST',
    path: '/streams',
    options: { auth: 'session', validate: { payload } },
    handler: async (request, h) => {
        const stream = await request.services().streamingService.createStream(request.payload);
        return stream ? h.response(stream).code(201) : h.response({ message: 'Source not found' }).code(404);
    }
};
