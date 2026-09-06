'use strict';

const Joi = require('@hapi/joi');
const { credentials } = require('../../validation/auth');

module.exports = {
    method: 'POST',
    path: '/register',
    options: {
        auth: false,
        validate: {
            payload: credentials.keys({ displayName: Joi.string().trim().min(1).max(120).required() }),
            failAction: (request, h, error) => h.view('register', {
                title: 'Create account', error: error.details[0].message, values: request.payload
            }).code(400).takeover()
        }
    },
    handler: async (request, h) => {
        const user = await request.services().authService.register(request.payload);
        if (!user) {
            return h.view('register', { title: 'Create account', error: 'That email is already registered.', values: request.payload }).code(409);
        }
        const token = await request.services().authService.createSession(user.id);
        request.cookieAuth.set({ token });
        return h.redirect('/dashboard');
    }
};
