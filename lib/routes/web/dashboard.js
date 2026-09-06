'use strict';

module.exports = {
    method: 'GET',
    path: '/dashboard',
    options: { auth: 'session' },
    handler: async (request, h) => {
        const [streamers, streams] = await Promise.all([
            request.services().streamingService.listStreamers(),
            request.services().streamingService.listStreams()
        ]);
        return h.view('dashboard', { title: 'Dashboard', user: request.auth.credentials, streamers, streams });
    }
};
