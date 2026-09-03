'use strict';

const Joi = require('@hapi/joi');

const credentials = Joi.object({
    email: Joi.string().email().max(254).required(),
    password: Joi.string().min(10).max(128).required()
});

const safeDestination = (next, fallback) => typeof next === 'string' && next.startsWith('/') && !next.startsWith('//') ? next : fallback;

module.exports = [
    {
        method: 'GET',
        path: '/',
        options: { auth: { strategy: 'session', mode: 'optional' } },
        handler: async (request, h) => {
            const streams = await request.services().streamingService.listStreams('live');
            return h.view('home', { title: 'Live now', streams, user: request.auth.credentials });
        }
    },
    {
        method: 'GET',
        path: '/register',
        options: { auth: false },
        handler: (request, h) => h.view('register', { title: 'Create account' })
    },
    {
        method: 'POST',
        path: '/register',
        options: {
            auth: false,
            validate: {
                payload: credentials.keys({ displayName: Joi.string().trim().min(1).max(120).required() }),
                failAction: (request, h, error) => h.view('register', {
                    title: 'Create account',
                    error: error.details[0].message,
                    values: request.payload
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
    },
    {
        method: 'GET',
        path: '/login',
        options: { auth: false, validate: { query: Joi.object({ next: Joi.string().max(500) }) } },
        handler: (request, h) => h.view('login', { title: 'Sign in', next: request.query.next })
    },
    {
        method: 'POST',
        path: '/login',
        options: {
            auth: false,
            validate: {
                query: Joi.object({ next: Joi.string().max(500) }),
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
    },
    {
        method: 'POST',
        path: '/logout',
        options: { auth: 'session' },
        handler: async (request, h) => {
            await request.services().authService.logout(request.state['streamzone-session']?.token);
            request.cookieAuth.clear();
            return h.redirect('/');
        }
    },
    {
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
    }
];
