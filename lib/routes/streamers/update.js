'use strict';

const Joi = require('@hapi/joi');
const id = require('../../validation/ids');
const { patchPayload } = require('../../validation/streamers');

module.exports = {
    method: 'PATCH',
    path: '/streamers/{streamerId}',
    options: { auth: 'session', validate: { params: Joi.object({ streamerId: id.required() }), payload: patchPayload } },
    handler: async (request, h) => {
        const streamer = await request.services().streamingService.updateStreamer(request.params.streamerId, request.payload);
        return streamer || h.response({ message: 'Streamer not found' }).code(404);
    }
};
