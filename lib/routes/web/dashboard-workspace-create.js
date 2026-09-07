'use strict';

const { payload } = require('../../validation/streamers');

const form = (values = {}, error = null, fieldErrors = {}) => ({ values, error, fieldErrors });

const render = async (request, h, firstWorkspace, statusCode) => {
    const user = request.auth.credentials;
    const dashboard = await request.services().dashboardService.overview(user.id);
    return h.view('dashboard', {
        title: 'Dashboard', pageStylesheet: '/assets/styles/owner-management.css', user,
        ...dashboard, firstWorkspace
    }).code(statusCode);
};

const duplicateSlug = (error) => typeof error?.code === 'string' &&
    error.code.startsWith('SQLITE_CONSTRAINT') && /Streamer\.slug/.test(error.message || '');

module.exports = {
    method: 'POST',
    path: '/dashboard/workspaces',
    options: { auth: 'session' },
    handler: async (request, h) => {
        const validation = payload.validate(request.payload || {}, { abortEarly: false, stripUnknown: true });
        if (validation.error) {
            const fieldErrors = Object.fromEntries(validation.error.details.map((detail) => [detail.path[0], detail.message]));
            return render(request, h, form(request.payload, 'Review the workspace details.', fieldErrors), 400);
        }

        try {
            const result = await request.services().streamingService.createStreamer(request.auth.credentials.id, validation.value);
            return h.redirect(`/dashboard?streamerId=${result.streamer.id}`).code(303);
        }
        catch (error) {
            if (duplicateSlug(error)) {
                return render(request, h, form(validation.value, 'That workspace URL is already in use.', {
                    slug: 'Choose a unique workspace URL.'
                }), 409);
            }
            throw error;
        }
    }
};
