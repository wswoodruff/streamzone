'use strict';

const Joi = require('@hapi/joi');
const CommandManagement = require('../../http/dashboard-command-management');
const id = require('../../validation/ids');

const payload = Joi.object({ enabled: Joi.boolean().required() });

module.exports = {
    method: 'POST',
    path: '/dashboard/streamers/{streamerId}/commands/{commandId}/toggle',
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

        const validation = payload.validate(request.payload, { convert: true, stripUnknown: true });
        if (validation.error) return h.response('Invalid command state').code(400);

        try {
            await request.services().streamingService.updateCommand(
                request.auth.credentials.id,
                request.params.streamerId,
                request.params.commandId,
                'manageCommands',
                validation.value
            );
            return CommandManagement.redirectToCommands(h, request.params.streamerId, validation.value.enabled ? 'enabled' : 'disabled');
        }
        catch (error) {
            return CommandManagement.handleMutationError(request, h, error, 'edit', Number(request.params.commandId), validation.value);
        }
    }
};
