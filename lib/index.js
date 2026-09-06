'use strict';

const Path = require('node:path');
const HauteCouture = require('@hapipal/haute-couture');

exports.plugin = {
    name: 'streamzone',
    version: '1.0.0',
    dependencies: ['@hapipal/schwifty', '@hapipal/schmervice', '@hapi/cookie', '@hapi/inert', '@hapi/vision'],
    register: async (server, options) => {
        server.views({
            engines: { hbs: require('handlebars') },
            path: Path.join(__dirname, 'templates'),
            layout: true,
            layoutPath: Path.join(__dirname, 'templates', 'layouts'),
            partialsPath: Path.join(__dirname, 'templates', 'partials'),
            isCached: process.env.NODE_ENV === 'production'
        });

        server.auth.strategy('session', 'cookie', {
            cookie: {
                name: 'streamzone-session',
                password: process.env.COOKIE_PASSWORD || 'development-only-cookie-password-change-me',
                isSecure: process.env.NODE_ENV === 'production',
                isHttpOnly: true,
                isSameSite: 'Lax',
                path: '/'
            },
            redirectTo: '/login',
            appendNext: true,
            validate: async (request, session) => request.services().authService.validateSession(session)
        });

        await HauteCouture.compose(server, options);
    }
};
