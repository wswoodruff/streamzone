'use strict';
module.exports = {
    method: 'GET', path: '/streamers/provider-connections/youtube/callback', options: { auth: 'session' },
    handler: async (request, h) => { try { const connection = await request.services().providerOAuthService.completeConnection(request.query.code, request.query.state, request.auth.credentials.id); return h.redirect(`/dashboard?streamerId=${connection.streamerId}`); } catch (error) { return h.response({ error: error.code || 'OAUTH_ERROR', message: error.message }).code(error.code === 'NOT_FOUND' ? 404 : 400); } }
};
