'use strict';
module.exports = {
    method: 'GET', path: '/streamers/{streamerId}/provider-connections/youtube/start', options: { auth: 'session' },
    handler: async (request, h) => { const streamerId = Number(request.params.streamerId); await request.services().authorizationService.requireCapability(request.auth.credentials.id, streamerId, 'manageProviderConnections'); return h.redirect(await request.services().providerOAuthService.begin({ purpose: 'provider_connection', userId: request.auth.credentials.id, streamerId })); }
};
