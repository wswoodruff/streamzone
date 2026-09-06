'use strict';

const DashboardActionResponse = require('../../http/dashboard-action-response');
const id = require('../../validation/ids');

module.exports = {
    method: 'POST',
    path: '/dashboard/ai',
    options: { auth: 'session' },
    handler: async (request, h) => {
        let streamerId = request.payload?.streamerId;
        try {
            streamerId = await id.required().validateAsync(streamerId);
            const { streamerId: ignored, ...configuration } = request.payload || {};
            await request.services().aiFeatureService.updateConfiguration(request.auth.credentials.id, streamerId, configuration);
            return DashboardActionResponse.redirect(h, { streamerId, section: 'ai', notice: 'ai-updated' });
        }
        catch (error) {
            return DashboardActionResponse.fromError(error, h, { streamerId, section: 'ai' });
        }
    }
};
