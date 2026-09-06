'use strict';

const { payload: commandPayload } = require('../validation/commands');
const CommandManagement = require('../view-models/command-management');

const duplicateCommand = (error) => error?.code === 'SQLITE_CONSTRAINT_UNIQUE' ||
    (error?.code === 'SQLITE_CONSTRAINT' && /Command\.streamerId, Command\.name/.test(error.message || ''));

const fieldErrors = (error) => {
    const errors = {};
    for (const detail of error?.details || []) {
        const field = detail.path?.[0];
        if (field && !errors[field]) errors[field] = detail.message.replace(/"/g, '');
    }
    return errors;
};

const renderDashboard = async (request, h, commandForm, statusCode) => {
    const user = request.auth.credentials;
    const dashboard = await request.services().dashboardService.overview(user.id, request.params.streamerId);
    const commandManagement = await CommandManagement.build({
        services: request.services(),
        userId: user.id,
        streamerId: dashboard.currentStreamer.id,
        canManage: dashboard.permissions.manageCommands,
        formState: commandForm
    });
    return h.view('dashboard', { title: 'Dashboard', user, ...dashboard, commandManagement }).code(statusCode);
};

exports.validateCommandForm = (payload) => commandPayload.validate(payload, {
    abortEarly: false,
    convert: true,
    stripUnknown: true
});

exports.renderValidationError = (request, h, mode, commandId, validation) => renderDashboard(request, h, {
    mode,
    commandId,
    values: validation.value,
    error: 'Fix the highlighted command fields and try again.',
    fieldErrors: fieldErrors(validation.error)
}, 400);

exports.handleMutationError = async (request, h, error, mode, commandId, values) => {
    if (error?.code === 'NOT_FOUND') return h.response(error.message).code(404);
    if (error?.code === 'FORBIDDEN') return h.response(error.message).code(403);
    if (duplicateCommand(error)) {
        return renderDashboard(request, h, {
            mode,
            commandId,
            values,
            error: 'A command with that name already exists for this creator.',
            fieldErrors: { name: 'Choose a unique command name.' }
        }, 409);
    }

    throw error;
};

exports.redirectToCommands = (h, streamerId, commandStatus) => h
    .redirect(`/dashboard?streamerId=${streamerId}&commandStatus=${commandStatus}#commands`)
    .code(303);
