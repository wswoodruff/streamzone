'use strict';

const { credentials, next } = require('../../validation/auth');

const safeDestination = (destination, fallback) => typeof destination === 'string' && destination.startsWith('/') && !destination.startsWith('//') ? destination : fallback;

module.exports = {
    method: 'POST',
    path: '/login',
    options: {
        auth: false,
        validate: {
            query: next,
            payload: credentials,
            failAction: (request, h, error) => h.view('login', {
                title: 'Sign in', error: error.details[0].message, email: request.payload.email, next: request.query.next
            }).code(400).takeover()
        }
    },
    handler: async (request, h) => {
        const result = await request.services().authService.login(request.payload.email, request.payload.password);
        if (!result) {
            return h.view('login', { title: 'Sign in', error: 'Email or password is incorrect.', email: request.payload.email }).code(401);
        }
        request.cookieAuth.set({ token: result.token });
        return h.redirect(safeDestination(request.query.next, '/dashboard'));
    }
};
