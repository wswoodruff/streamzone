'use strict';

const Joi = require('@hapi/joi');
const id = require('../../validation/ids');
const { patchPayload } = require('../../validation/commands');

module.exports = {
    method: 'PATCH',
    path: '/streamers/{streamerId}/commands/{commandId}',
    options: {
        auth: 'session',
        validate: {
            params: Joi.object({ streamerId: id.required(), commandId: id.required() }),
            payload: patchPayload
        }
    },
    handler: async (request, h) => {
        const command = await request.services().streamingService.updateCommand(
            request.params.streamerId, request.params.commandId, request.payload
        );
        return command || h.response({ message: 'Command not found' }).code(404);
    }
};
