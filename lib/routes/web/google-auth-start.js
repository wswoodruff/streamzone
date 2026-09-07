'use strict';
module.exports = { method: 'GET', path: '/auth/google/start', options: { auth: false }, handler: async (request, h) => h.redirect(await request.services().providerOAuthService.begin({ purpose: 'dashboard_login' })) };
