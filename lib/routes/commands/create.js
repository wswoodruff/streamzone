'use strict';

const ManagementResponse = require('../../http/management-response');

const Joi = require('@hapi/joi');
const id = require('../../validation/ids');
const { payload } = require('../../validation/commands');

module.exports = {
    method: 'POST',
    path: '/streamers/{streamerId}/commands',
    options: { auth: 'session', validate: { params: Joi.object({ streamerId: id.required() }), payload } },
    handler: async (request, h) => {
        try {
            const command = await request.services().streamingService.createCommand(request.auth.credentials.id, request.params.streamerId, 'manageCommands', request.payload);
            return command ? h.response(command).code(201) : h.response({ message: 'Streamer not found' }).code(404);
        }
        catch (error) {
            return ManagementResponse.fromError(error, h);
        }
    }
};
