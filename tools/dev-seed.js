'use strict';

const OWNER = Object.freeze({
    email: 'owner.dev@example.com',
    displayName: 'Local Owner',
    password: 'streamzone-owner-dev'
});
const EDITOR = Object.freeze({
    email: 'editor.dev@example.com',
    displayName: 'Local Editor',
    password: 'streamzone-editor-dev'
});

const seed = async () => {
    if (process.env.NODE_ENV === 'production') {
        throw new Error('Refusing to seed development data when NODE_ENV=production.');
    }

    process.env.COOKIE_PASSWORD ||= 'development-seed-cookie-password-only';

    // Load application startup only after the production guard. This keeps the
    // fixture credentials completely outside the production server path.
    const { createServer } = require('../server');
    const server = await createServer();
    await server.initialize();

    try {
        const services = server.services();
        const { User, Streamer, StreamerMembership, Source, StreamSession, Command } = server.models();
        const ensureUser = async (account) => {
            const existing = await User.query().findOne({ email: account.email });
            return existing || services.authService.register(account);
        };
        const owner = await ensureUser(OWNER);
        const editor = await ensureUser(EDITOR);
        let streamer = await Streamer.query().findOne({ slug: 'local-creator' });
        if (!streamer) {
            ({ streamer } = await services.streamingService.createStreamer(owner.id, {
                slug: 'local-creator', displayName: 'Local Creator'
            }));
        }

        await StreamerMembership.query().insert({ userId: owner.id, streamerId: streamer.id, role: 'owner' })
            .onConflict(['userId', 'streamerId']).merge({ role: 'owner' });
        await StreamerMembership.query().insert({ userId: editor.id, streamerId: streamer.id, role: 'editor' })
            .onConflict(['userId', 'streamerId']).merge({ role: 'editor' });
        await Source.query().insert({ streamerId: streamer.id, provider: 'youtube', channelId: 'local-youtube-placeholder', enabled: true })
            .onConflict(['provider', 'channelId']).ignore();
        const existingSession = await StreamSession.query().findOne({ streamerId: streamer.id, title: 'Local development session' });
        if (!existingSession) {
            await StreamSession.query().insert({ streamerId: streamer.id, title: 'Local development session', status: 'scheduled' });
        }
        await Command.query().insert({
            streamerId: streamer.id, name: 'hello', responseTemplate: 'Hello from the local Streamzone workspace!',
            enabled: true, cooldownSeconds: 0, cooldownScope: 'streamer', requiredChatRole: 'everyone'
        }).onConflict(['streamerId', 'name']).ignore();

        console.log(`Development accounts: ${OWNER.email}, ${EDITOR.email}`);
        console.log(`Development workspace: @${streamer.slug}`);
        console.log('Passwords documented in README.md are development-only and must never be used in production.');
    }
    finally {
        await server.stop();
    }
};

if (require.main === module) {
    seed().catch((error) => {
        console.error(error.message);
        process.exitCode = 1;
    });
}

module.exports = { seed };
