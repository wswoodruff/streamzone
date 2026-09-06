'use strict';

const Web = require('../../http/stream-management-web');
const { sessionPayload } = require('../../validation/stream-management');

const utcIso = (value) => {
    if (!value) return null;

    const timestamp = Date.parse(`${value}Z`);
    if (!Number.isFinite(timestamp)) {
        const error = new Error('Scheduled time must be a valid UTC date and time.');
        error.code = 'INVALID_STREAM_MANAGEMENT_FORM';
        throw error;
    }

    return new Date(timestamp).toISOString();
};

module.exports = {
    method: 'POST',
    path: '/dashboard/stream-management/sessions',
    options: {
        auth: 'session',
        validate: {
            payload: sessionPayload,
            failAction: Web.failAction('sessions')
        }
    },
    handler: async (request, h) => {
        const streamerId = request.payload.streamerId;
        try {
            await request.services().streamingService.createStreamSession(request.auth.credentials.id, streamerId, 'manageStreams', {
                title: request.payload.title,
                status: 'scheduled',
                scheduledAt: utcIso(request.payload.scheduledAt)
            });
            return Web.redirect(h, streamerId, 'notice', 'StreamSession created.', 'sessions');
        }
        catch (error) {
            return Web.fromError(error, h, streamerId, 'sessions');
        }
    }
};
