'use strict';

const { payload } = require('../../validation/streamers');

module.exports = {
    method: 'POST',
    path: '/streamers',
    options: { auth: 'session', validate: { payload } },
    handler: async (request, h) => {
        const result = await request.services().streamingService.createStreamer(request.auth.credentials.id, request.payload);
        return h.response(result).code(201);
    }
};
