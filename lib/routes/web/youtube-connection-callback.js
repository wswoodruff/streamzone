'use strict';
module.exports = {
    method: 'GET', path: '/streamers/provider-connections/youtube/callback', options: { auth: 'session' },
    handler: async (request, h) => { try { if (request.query.error) { const error = new Error(request.query.error === 'access_denied' ? 'YouTube authorization or required scopes were denied.' : 'YouTube authorization failed.'); error.code = request.query.error === 'access_denied' ? 'SCOPE_DENIED' : 'OAUTH_ERROR'; throw error; } const connection = await request.services().providerOAuthService.completeConnection(request.query.code, request.query.state, request.auth.credentials.id); return h.redirect(`/dashboard/stream-management?streamerId=${connection.streamerId}&notice=${encodeURIComponent('YouTube connected.')}#sources`); } catch (error) { return h.response({ error: error.code || 'OAUTH_ERROR', message: error.message }).code(error.code === 'NOT_FOUND' ? 404 : 400); } }
};
