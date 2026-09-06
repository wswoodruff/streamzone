'use strict';

const Web = require('../../http/stream-management-web');
const { sourcePayload } = require('../../validation/stream-management');

module.exports = {
    method: 'POST',
    path: '/dashboard/stream-management/sources',
    options: {
        auth: 'session',
        validate: {
            payload: sourcePayload,
            failAction: Web.failAction('sources')
        }
    },
    handler: async (request, h) => {
        const streamerId = request.payload.streamerId;
        try {
            await request.services().streamingService.addSource(request.auth.credentials.id, streamerId, 'manageSources', {
                provider: request.payload.provider,
                channelId: request.payload.channelId,
                enabled: true
            });
            return Web.redirect(h, streamerId, 'notice', 'Provider source added.', 'sources');
        }
        catch (error) {
            return Web.fromError(error, h, streamerId, 'sources');
        }
    }
};
