'use strict';

module.exports = {
    method: 'GET',
    path: '/',
    options: { auth: { strategy: 'session', mode: 'optional' } },
    handler: async (request, h) => {
        const streams = await request.services().streamingService.listStreams('live');
        return h.view('home', { title: 'Live now', streams, user: request.auth.credentials });
    }
};
