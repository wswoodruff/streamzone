'use strict';
module.exports = {
    method: 'GET', path: '/auth/google/callback', options: { auth: false },
    handler: async (request, h) => {
        try { const user = await request.services().providerOAuthService.completeLogin(request.query.code, request.query.state); const token = await request.services().authService.createSession(user.id); request.cookieAuth.set({ token }); return h.redirect('/dashboard'); }
        catch (error) { return h.response({ error: error.code || 'OAUTH_ERROR', message: error.message }).code(400); }
    }
};
