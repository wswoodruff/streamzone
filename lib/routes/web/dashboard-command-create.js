'use strict';

const Joi = require('@hapi/joi');
const CommandManagement = require('../../http/dashboard-command-management');
const id = require('../../validation/ids');

module.exports = {
    method: 'POST',
    path: '/dashboard/streamers/{streamerId}/commands',
    options: {
        auth: 'session',
        validate: { params: Joi.object({ streamerId: id.required() }) }
    },
    handler: async (request, h) => {
        try {
            await request.services().authorizationService.requireCapability(
                request.auth.credentials.id, request.params.streamerId, 'manageCommands'
            );
        }
        catch (error) {
            return CommandManagement.handleMutationError(request, h, error, 'create', null, request.payload || {});
        }

        const validation = CommandManagement.validateCommandForm(request.payload);
        if (validation.error) return CommandManagement.renderValidationError(request, h, 'create', null, validation);

        try {
            await request.services().streamingService.createCommand(
                request.auth.credentials.id,
                request.params.streamerId,
                'manageCommands',
                validation.value
            );
            return CommandManagement.redirectToCommands(h, request.params.streamerId, 'created');
        }
        catch (error) {
            return CommandManagement.handleMutationError(request, h, error, 'create', null, validation.value);
        }
    }
};
