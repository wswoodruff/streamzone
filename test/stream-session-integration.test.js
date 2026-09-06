'use strict';

const Assert = require('node:assert/strict');
const Test = require('node:test');
let dependenciesAvailable = true;
try {
    require.resolve('knex');
    require.resolve('objection');
    require.resolve('better-sqlite3');
}
catch {
    dependenciesAvailable = false;
}

if (!dependenciesAvailable) {
    Test('stream session integration assertions (database dependencies unavailable)', { skip: true }, () => {});
}
else {
    const Knex = require('knex');
    const { Model } = require('objection');
    const StreamingService = require('../lib/services/streaming-service');
    const Streamer = require('../lib/models/streamer');
    const Source = require('../lib/models/source');
    const Stream = require('../lib/models/stream');
    const StreamSession = require('../lib/models/stream-session');
    const migration = require('../migrations/001-create-streaming-tables');
    const sessionMigration = require('../migrations/008-create-stream-sessions');

    const setup = async (t) => {
        const knex = Knex({ client: 'better-sqlite3', connection: { filename: ':memory:' }, useNullAsDefault: true });
        await knex.raw('PRAGMA foreign_keys = ON');
        await migration.up(knex);
        await sessionMigration.up(knex);
        Model.knex(knex);
        t.after(async () => {
            Model.knex(null);
            await knex.destroy();
        });

        const [firstStreamerId] = await knex('Streamer').insert({ slug: 'first', displayName: 'First' });
        const [secondStreamerId] = await knex('Streamer').insert({ slug: 'second', displayName: 'Second' });
        const [twitchSourceId] = await knex('Source').insert({ streamerId: firstStreamerId, provider: 'twitch', channelId: 'first-twitch' });
        const [youtubeSourceId] = await knex('Source').insert({ streamerId: firstStreamerId, provider: 'youtube', channelId: 'first-youtube' });
        const [foreignSourceId] = await knex('Source').insert({ streamerId: secondStreamerId, provider: 'twitch', channelId: 'second-twitch' });
        const service = new StreamingService();
        service.server = {
            models: () => ({ Streamer, Source, Stream, StreamSession }),
            services: () => ({ authorizationService: { requireCapability: async () => 'owner' } })
        };
        return { knex, service, firstStreamerId, secondStreamerId, twitchSourceId, youtubeSourceId, foreignSourceId };
    };

    Test('a single provider occurrence can be attached while legacy streams remain ungrouped', async (t) => {
        const { knex, service, firstStreamerId, twitchSourceId } = await setup(t);
        const legacyId = (await knex('Stream').insert({ sourceId: twitchSourceId, externalId: 'legacy', status: 'offline' }))[0];
        const streamId = (await knex('Stream').insert({ sourceId: twitchSourceId, externalId: 'current', status: 'scheduled' }))[0];
        const session = await service.createStreamSession(1, firstStreamerId, 'manageStreams', { title: 'Weekly show' });

        const attached = await service.attachStreamToSession(1, firstStreamerId, session.id, streamId, 'manageStreams');

        Assert.equal(attached.status, 'scheduled');
        Assert.equal((await knex('Stream').where({ id: streamId }).first()).streamSessionId, session.id);
        Assert.equal((await knex('Stream').where({ id: legacyId }).first()).streamSessionId, null);
    });

    Test('simulcast provider occurrences share one session and reconcile lifecycle timestamps', async (t) => {
        const { knex, service, firstStreamerId, twitchSourceId, youtubeSourceId } = await setup(t);
        const twitchId = (await knex('Stream').insert({ sourceId: twitchSourceId, externalId: 'tw-1', status: 'scheduled' }))[0];
        const youtubeId = (await knex('Stream').insert({ sourceId: youtubeSourceId, externalId: 'yt-1', status: 'scheduled' }))[0];
        const session = await service.createStreamSession(1, firstStreamerId, 'manageStreams', { title: 'Simulcast', scheduledAt: '2026-09-07T10:00:00.000Z' });
        await service.attachStreamToSession(1, firstStreamerId, session.id, twitchId, 'manageStreams');
        await service.attachStreamToSession(1, firstStreamerId, session.id, youtubeId, 'manageStreams');

        await knex('Stream').where({ id: twitchId }).update({ status: 'live', startedAt: '2026-09-07T10:01:00.000Z' });
        let reconciled = await service.reconcileStreamSession(session.id);
        Assert.equal(reconciled.status, 'live');
        Assert.equal(new Date(reconciled.startedAt).toISOString(), '2026-09-07T10:01:00.000Z');

        await knex('Stream').where({ id: twitchId }).update({ status: 'offline', endedAt: '2026-09-07T11:00:00.000Z' });
        await knex('Stream').where({ id: youtubeId }).update({ status: 'offline', startedAt: '2026-09-07T10:02:00.000Z', endedAt: '2026-09-07T11:02:00.000Z' });
        reconciled = await service.reconcileStreamSession(session.id);
        Assert.equal(reconciled.status, 'ended');
        Assert.equal(new Date(reconciled.endedAt).toISOString(), '2026-09-07T11:02:00.000Z');
    });

    Test('cross-streamer session attachment is rejected without changing the occurrence', async (t) => {
        const { knex, service, firstStreamerId, foreignSourceId } = await setup(t);
        const streamId = (await knex('Stream').insert({ sourceId: foreignSourceId, externalId: 'foreign', status: 'live' }))[0];
        const session = await service.createStreamSession(1, firstStreamerId, 'manageStreams', { title: 'Local' });

        await Assert.rejects(
            service.attachStreamToSession(1, firstStreamerId, session.id, streamId, 'manageStreams'),
            (error) => error.code === 'NOT_FOUND'
        );
        Assert.equal((await knex('Stream').where({ id: streamId }).first()).streamSessionId, null);
    });

    Test('manual lifecycle changes enforce timestamp and forward-only rules', async (t) => {
        const { service, firstStreamerId } = await setup(t);
        const session = await service.createStreamSession(1, firstStreamerId, 'manageStreams', { title: 'Lifecycle' });
        await Assert.rejects(
            service.updateStreamSession(1, firstStreamerId, session.id, 'manageStreams', { status: 'live' }),
            (error) => error.code === 'INVALID_SESSION_LIFECYCLE'
        );
        const live = await service.updateStreamSession(1, firstStreamerId, session.id, 'manageStreams', {
            status: 'live', startedAt: '2026-09-07T10:00:00.000Z'
        });
        const ended = await service.updateStreamSession(1, firstStreamerId, session.id, 'manageStreams', {
            status: 'ended', endedAt: '2026-09-07T11:00:00.000Z'
        });
        Assert.equal(live.status, 'live');
        Assert.equal(ended.status, 'ended');
        await Assert.rejects(
            service.updateStreamSession(1, firstStreamerId, session.id, 'manageStreams', { status: 'scheduled', startedAt: null, endedAt: null }),
            (error) => error.code === 'INVALID_SESSION_LIFECYCLE'
        );
    });
}
