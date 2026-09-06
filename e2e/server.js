'use strict';

const Fs = require('node:fs/promises');
const Os = require('node:os');
const Path = require('node:path');

const OWNER = {
    email: 'owner@streamzone.test',
    displayName: 'Morgan Streamer',
    password: 'streamzone-owner-password'
};

let server;
let temporaryDirectory;
let cleanupPromise;

const cleanup = async () => {
    if (cleanupPromise) return cleanupPromise;

    cleanupPromise = (async () => {
        if (server) {
            await server.stop({ timeout: 5_000 });
            server = undefined;
        }
        if (temporaryDirectory) {
            await Fs.rm(temporaryDirectory, { recursive: true, force: true });
            temporaryDirectory = undefined;
        }
    })();

    return cleanupPromise;
};

const seedManagementState = async (activeServer) => {
    const services = activeServer.services();
    const owner = await services.authService.register(OWNER);
    if (!owner) throw new Error('E2E owner seed already exists.');

    const { streamer } = await services.streamingService.createStreamer(owner.id, {
        slug: 'aurora-live',
        displayName: 'Aurora Live',
        createdAt: '2026-09-01T12:00:00.000Z'
    });

    const twitch = await services.streamingService.addSource(owner.id, streamer.id, 'manageSources', {
        provider: 'twitch',
        channelId: 'aurora-live-twitch',
        enabled: true,
        createdAt: '2026-09-01T12:01:00.000Z'
    });
    const youtube = await services.streamingService.addSource(owner.id, streamer.id, 'manageSources', {
        provider: 'youtube',
        channelId: 'aurora-live-youtube',
        enabled: true,
        createdAt: '2026-09-01T12:02:00.000Z'
    });

    const streamSession = await services.streamingService.createStreamSession(owner.id, streamer.id, 'manageStreams', {
        title: 'Sunday Launch Show',
        status: 'scheduled',
        scheduledAt: '2026-09-06T20:00:00.000Z',
        createdAt: '2026-09-01T12:03:00.000Z',
        updatedAt: '2026-09-01T12:03:00.000Z'
    });

    await services.streamingService.createStream(owner.id, 'manageStreams', {
        sourceId: twitch.id,
        streamSessionId: streamSession.id,
        externalId: 'twitch-launch-001',
        title: 'Sunday Launch Show',
        status: 'live',
        startedAt: '2026-09-06T20:00:00.000Z',
        endedAt: null,
        createdAt: '2026-09-06T20:00:01.000Z'
    });
    await services.streamingService.createStream(owner.id, 'manageStreams', {
        sourceId: youtube.id,
        streamSessionId: streamSession.id,
        externalId: 'youtube-launch-001',
        title: 'Sunday Launch Show',
        status: 'live',
        startedAt: '2026-09-06T20:00:05.000Z',
        endedAt: null,
        createdAt: '2026-09-06T20:00:06.000Z'
    });

    await services.streamingService.createCommand(owner.id, streamer.id, 'manageCommands', {
        name: 'schedule',
        responseTemplate: 'Next Streamzone show: Sunday Launch Show',
        enabled: true,
        cooldownSeconds: 15,
        cooldownScope: 'session',
        requiredChatRole: 'moderator'
    });
};

const main = async () => {
    temporaryDirectory = await Fs.mkdtemp(Path.join(Os.tmpdir(), 'streamzone-e2e-'));
    process.env.DATABASE_FILE = Path.join(temporaryDirectory, 'streamzone.sqlite');
    process.env.HOST = '127.0.0.1';
    process.env.PORT = process.env.STREAMZONE_E2E_PORT || '3107';
    process.env.NODE_ENV = 'test';

    const { createServer } = require('../server');
    server = await createServer();
    await server.initialize();
    await seedManagementState(server);
    await server.start();

    console.log(`E2E Streamzone server running at ${server.info.uri}`);
};

const shutdown = (exitCode) => {
    void cleanup().then(
        () => process.exit(exitCode),
        (error) => {
            console.error(error);
            process.exit(1);
        }
    );
};

process.once('SIGTERM', () => shutdown(0));
process.once('SIGINT', () => shutdown(130));
process.once('uncaughtException', (error) => {
    console.error(error);
    shutdown(1);
});
process.once('unhandledRejection', (error) => {
    console.error(error);
    shutdown(1);
});

main().catch(async (error) => {
    console.error(error);
    await cleanup();
    process.exitCode = 1;
});
