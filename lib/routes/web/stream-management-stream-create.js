'use strict';

const Web = require('../../http/stream-management-web');
const { streamPayload } = require('../../validation/stream-management');

const nullableText = (value) => value || null;

module.exports = {
    method: 'POST',
    path: '/dashboard/stream-management/streams',
    options: {
        auth: 'session',
        validate: {
            payload: streamPayload,
            failAction: Web.failAction('broadcasts')
        }
    },
    handler: async (request, h) => {
        const streamerId = request.payload.streamerId;
        try {
            const now = new Date().toISOString();
            const startedAt = request.payload.status === 'live' ? now : null;
            const endedAt = request.payload.status === 'offline' ? now : null;

            await request.services().streamingService.createStream(request.auth.credentials.id, 'manageStreams', {
                sourceId: request.payload.sourceId,
                streamSessionId: request.payload.streamSessionId,
                externalId: nullableText(request.payload.externalId),
                title: nullableText(request.payload.title),
                status: request.payload.status,
                startedAt,
                endedAt
            });
            return Web.redirect(h, streamerId, 'notice', 'Provider broadcast attached to the StreamSession.', 'broadcasts');
        }
        catch (error) {
            return Web.fromError(error, h, streamerId, 'broadcasts');
        }
    }
};
