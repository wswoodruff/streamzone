'use strict';

const Fs = require('node:fs/promises');
const Os = require('node:os');
const Path = require('node:path');

const clonePluginsWithDatabase = (plugins, filename) => plugins.map((registration, index) => {
    if (index !== 0) return registration;

    return {
        ...registration,
        options: {
            ...registration.options,
            knex: {
                ...registration.options.knex,
                connection: { filename }
            }
        }
    };
});

exports.startServer = async (t) => {
    const Hapi = require('@hapi/hapi');
    const directory = await Fs.mkdtemp(Path.join(Os.tmpdir(), 'streamzone-test-'));
    const filename = Path.join(directory, 'database.sqlite');
    const manifest = require('../../server/manifest');
    const server = Hapi.server({ ...manifest.server, port: 0 });

    await server.register(clonePluginsWithDatabase(manifest.register.plugins, filename));
    await server.initialize();

    const context = {
        server,
        knex: server.models().Streamer.knex(),
        models: server.models(),
        services: server.services()
    };

    t.after(async () => {
        await server.stop();
        await Fs.rm(directory, { recursive: true, force: true });
    });

    return context;
};

exports.createUser = async (context, values = {}) => {
    const nonce = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const password = values.password || 'correct horse battery staple';
    const user = await context.services.authService.register({
        email: values.email || `user-${nonce}@example.com`,
        displayName: values.displayName || `User ${nonce}`,
        password
    });
    const token = await context.services.authService.createSession(user.id);

    return { user, password, token };
};

exports.injectAuthenticated = (context, account, options) => context.server.inject({
    ...options,
    auth: {
        strategy: 'session',
        credentials: account.user,
        artifacts: { token: account.token }
    }
});

exports.createTenant = async (context, account, role = 'owner', values = {}) => {
    const nonce = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const streamer = await context.models.Streamer.query().insert({
        slug: values.slug || `tenant-${nonce}`,
        displayName: values.displayName || `Tenant ${nonce}`
    });
    await context.models.StreamerMembership.query().insert({ userId: account.user.id, streamerId: streamer.id, role });
    return streamer;
};

exports.addMembership = (context, account, streamer, role) => context.models.StreamerMembership.query().insert({
    userId: account.user.id,
    streamerId: streamer.id,
    role
});

exports.createSource = (context, streamer, values = {}) => context.models.Source.query().insert({
    streamerId: streamer.id,
    provider: values.provider || 'twitch',
    channelId: values.channelId || `channel-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    enabled: values.enabled ?? true
});
