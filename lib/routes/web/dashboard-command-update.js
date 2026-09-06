'use strict';

const Joi = require('@hapi/joi');
const CommandManagement = require('../../http/dashboard-command-management');
const id = require('../../validation/ids');

module.exports = {
    method: 'POST',
    path: '/dashboard/streamers/{streamerId}/commands/{commandId}',
    options: {
        auth: 'session',
        validate: { params: Joi.object({ streamerId: id.required(), commandId: id.required() }) }
    },
    handler: async (request, h) => {
        try {
            await request.services().authorizationService.requireCommandCapability(
                request.auth.credentials.id, request.params.streamerId, request.params.commandId, 'manageCommands'
            );
        }
        catch (error) {
            return CommandManagement.handleMutationError(request, h, error, 'edit', Number(request.params.commandId), request.payload || {});
        }

        const validation = CommandManagement.validateCommandForm(request.payload);
        if (validation.error) return CommandManagement.renderValidationError(request, h, 'edit', Number(request.params.commandId), validation);

        try {
            await request.services().streamingService.updateCommand(
                request.auth.credentials.id,
                request.params.streamerId,
                request.params.commandId,
                'manageCommands',
                validation.value
            );
            return CommandManagement.redirectToCommands(h, request.params.streamerId, 'updated');
        }
        catch (error) {
            return CommandManagement.handleMutationError(request, h, error, 'edit', Number(request.params.commandId), validation.value);
        }
    }
};
