'use strict';

const Joi = require('@hapi/joi');
const id = require('../../validation/ids');
const { payload } = require('../../validation/sources');

module.exports = {
    method: 'POST',
    path: '/streamers/{streamerId}/sources',
    options: { auth: 'session', validate: { params: Joi.object({ streamerId: id.required() }), payload } },
    handler: async (request, h) => {
        const source = await request.services().streamingService.addSource(request.params.streamerId, request.payload);
        return source ? h.response(source).code(201) : h.response({ message: 'Streamer not found' }).code(404);
    }
};
