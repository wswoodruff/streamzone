'use strict';

module.exports = {
    method: 'GET',
    path: '/dashboard',
    options: { auth: 'session' },
    handler: async (request, h) => {
        const user = request.auth.credentials;
        const [streamers, streams] = await Promise.all([
            request.services().streamingService.listManagedStreamers(user.id, 'readManagement'),
            request.services().streamingService.listManagedStreams(user.id, 'readManagement')
        ]);
        return h.view('dashboard', { title: 'Dashboard', user, streamers, streams });
    }
};
