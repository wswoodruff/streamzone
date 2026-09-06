'use strict';

const Joi = require('@hapi/joi');
const CommandManagement = require('../../http/dashboard-command-management');
const id = require('../../validation/ids');

module.exports = {
    method: 'POST',
    path: '/dashboard/streamers/{streamerId}/commands/{commandId}/delete',
    options: {
        auth: 'session',
        validate: { params: Joi.object({ streamerId: id.required(), commandId: id.required() }) }
    },
    handler: async (request, h) => {
        try {
            await request.services().authorizationService.requireCommandCapability(
                request.auth.credentials.id, request.params.streamerId, request.params.commandId, 'manageCommands'
            );
            await request.services().streamingService.deleteCommand(
                request.auth.credentials.id,
                request.params.streamerId,
                request.params.commandId,
                'manageCommands'
            );
            return CommandManagement.redirectToCommands(h, request.params.streamerId, 'deleted');
        }
        catch (error) {
            return CommandManagement.handleMutationError(request, h, error, 'edit', Number(request.params.commandId), {});
        }
    }
};
