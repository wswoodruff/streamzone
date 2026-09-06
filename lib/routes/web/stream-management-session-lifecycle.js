'use strict';

const Joi = require('@hapi/joi');
const Web = require('../../http/stream-management-web');
const id = require('../../validation/ids');
const { lifecyclePayload } = require('../../validation/stream-management');

module.exports = {
    method: 'POST',
    path: '/dashboard/stream-management/sessions/{streamSessionId}/lifecycle',
    options: {
        auth: 'session',
        validate: {
            params: Joi.object({ streamSessionId: id.required() }),
            payload: lifecyclePayload,
            failAction: Web.failAction('sessions')
        }
    },
    handler: async (request, h) => {
        const streamerId = request.payload.streamerId;
        const action = request.payload.action;
        const now = new Date().toISOString();
        const changes = action === 'start' ?
            { status: 'live', startedAt: now, endedAt: null } :
            { status: 'ended', endedAt: now };

        try {
            await request.services().streamingService.updateStreamSession(
                request.auth.credentials.id,
                streamerId,
                request.params.streamSessionId,
                'manageStreams',
                changes
            );
            return Web.redirect(h, streamerId, 'notice', action === 'start' ? 'StreamSession started.' : 'StreamSession ended.', 'sessions');
        }
        catch (error) {
            return Web.fromError(error, h, streamerId, 'sessions');
        }
    }
};
