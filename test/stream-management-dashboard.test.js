'use strict';

const Assert = require('node:assert/strict');
const Test = require('node:test');
const { addMembership, createSource, createTenant, createUser, injectAuthenticated, startServer } = require('./helpers/server');

Test('stream management explains and renders Source, provider broadcast, and StreamSession relationships', async (t) => {
    const context = await startServer(t);
    const owner = await createUser(context, { displayName: 'Owner Account' });
    const streamer = await createTenant(context, owner, 'owner', { displayName: 'Primary Creator', slug: 'primary' });
    const source = await createSource(context, streamer, { provider: 'youtube', channelId: 'primary-youtube' });
    const session = await context.services.streamingService.createStreamSession(owner.user.id, streamer.id, 'manageStreams', {
        title: 'Launch Session',
        status: 'scheduled',
        scheduledAt: '2026-09-07T18:30:00.000Z'
    });
    await context.services.streamingService.createStream(owner.user.id, 'manageStreams', {
        sourceId: source.id,
        streamSessionId: session.id,
        externalId: 'provider-occurrence-1',
        title: 'Provider Launch',
        status: 'scheduled',
        startedAt: null,
        endedAt: null
    });

    const response = await injectAuthenticated(context, owner, {
        method: 'GET',
        url: `/dashboard/stream-management?streamerId=${streamer.id}`
    });

    Assert.equal(response.statusCode, 200);
    for (const expected of [
        'Streams &amp; sources',
        'Two related records, two jobs',
        'Streamzone runtime window',
        'Provider broadcast',
        'Launch Session',
        'Provider Launch',
        'YouTube',
        'primary-youtube',
        'StreamSession: Launch Session',
        'Create a StreamSession',
        'Add a source',
        'Attach a provider broadcast'
    ]) Assert.match(response.result, new RegExp(expected));
});

Test('stream management form routes mutate through existing streaming service boundaries', async (t) => {
    const context = await startServer(t);
    const owner = await createUser(context);
    const streamer = await createTenant(context, owner, 'owner');

    const sourceResponse = await injectAuthenticated(context, owner, {
        method: 'POST',
        url: '/dashboard/stream-management/sources',
        payload: { streamerId: streamer.id, provider: 'youtube', channelId: 'managed-channel' }
    });
    Assert.equal(sourceResponse.statusCode, 303);
    const source = await context.models.Source.query().findOne({ streamerId: streamer.id, channelId: 'managed-channel' });
    Assert.ok(source);
    Assert.equal(source.enabled, true);

    const sessionResponse = await injectAuthenticated(context, owner, {
        method: 'POST',
        url: '/dashboard/stream-management/sessions',
        payload: { streamerId: streamer.id, title: 'Managed Session', scheduledAt: '2026-09-07T18:30' }
    });
    Assert.equal(sessionResponse.statusCode, 303);
    let session = await context.models.StreamSession.query().findOne({ streamerId: streamer.id, title: 'Managed Session' });
    Assert.ok(session);
    Assert.equal(new Date(session.scheduledAt).toISOString(), '2026-09-07T18:30:00.000Z');
    Assert.equal(session.status, 'scheduled');

    const streamResponse = await injectAuthenticated(context, owner, {
        method: 'POST',
        url: '/dashboard/stream-management/streams',
        payload: {
            streamerId: streamer.id,
            sourceId: source.id,
            streamSessionId: session.id,
            externalId: 'managed-occurrence',
            title: 'Managed Broadcast',
            status: 'scheduled'
        }
    });
    Assert.equal(streamResponse.statusCode, 303);
    const stream = await context.models.Stream.query().findOne({ externalId: 'managed-occurrence' });
    Assert.ok(stream);
    Assert.equal(stream.sourceId, source.id);
    Assert.equal(stream.streamSessionId, session.id);

    const startResponse = await injectAuthenticated(context, owner, {
        method: 'POST',
        url: `/dashboard/stream-management/sessions/${session.id}/lifecycle`,
        payload: { streamerId: streamer.id, action: 'start' }
    });
    Assert.equal(startResponse.statusCode, 303);
    session = await context.models.StreamSession.query().findById(session.id);
    Assert.equal(session.status, 'live');
    Assert.ok(session.startedAt);

    const endResponse = await injectAuthenticated(context, owner, {
        method: 'POST',
        url: `/dashboard/stream-management/sessions/${session.id}/lifecycle`,
        payload: { streamerId: streamer.id, action: 'end' }
    });
    Assert.equal(endResponse.statusCode, 303);
    session = await context.models.StreamSession.query().findById(session.id);
    Assert.equal(session.status, 'ended');
    Assert.ok(session.endedAt);
});

Test('viewer receives a read-only stream management surface and cannot mutate it', async (t) => {
    const context = await startServer(t);
    const owner = await createUser(context);
    const viewer = await createUser(context, { displayName: 'Read Only Account' });
    const streamer = await createTenant(context, owner, 'owner', { displayName: 'Shared Creator' });
    await addMembership(context, viewer, streamer, 'viewer');

    const page = await injectAuthenticated(context, viewer, {
        method: 'GET',
        url: `/dashboard/stream-management?streamerId=${streamer.id}`
    });
    Assert.equal(page.statusCode, 200);
    Assert.match(page.result, /Viewer access/);
    Assert.match(page.result, /Read only/);
    Assert.doesNotMatch(page.result, /<button type="submit">Add source<\/button>/);
    Assert.doesNotMatch(page.result, /<button type="submit">Create session<\/button>/);

    const mutation = await injectAuthenticated(context, viewer, {
        method: 'POST',
        url: '/dashboard/stream-management/sources',
        payload: { streamerId: streamer.id, provider: 'twitch', channelId: 'forbidden-channel' }
    });
    Assert.equal(mutation.statusCode, 303);
    Assert.match(mutation.headers.location, /error=/);
    Assert.equal(await context.models.Source.query().where({ streamerId: streamer.id }).resultSize(), 0);
});

Test('stream management renders strong empty states without inventing ungrouped provider rows', async (t) => {
    const context = await startServer(t);
    const owner = await createUser(context);
    const streamer = await createTenant(context, owner, 'owner');

    const response = await injectAuthenticated(context, owner, {
        method: 'GET',
        url: `/dashboard/stream-management?streamerId=${streamer.id}`
    });

    Assert.equal(response.statusCode, 200);
    Assert.match(response.result, /No StreamSessions yet/);
    Assert.match(response.result, /No provider sources configured/);
    Assert.match(response.result, /No provider broadcasts attached/);
    Assert.match(response.result, /Create the prerequisites first/);
});

Test('editor can manage sources and stream lifecycle controls', async (t) => {
    const context = await startServer(t);
    const owner = await createUser(context);
    const editor = await createUser(context, { displayName: 'Editor Account' });
    const streamer = await createTenant(context, owner, 'owner', { displayName: 'Editor Managed Creator' });
    await addMembership(context, editor, streamer, 'editor');

    const page = await injectAuthenticated(context, editor, {
        method: 'GET',
        url: `/dashboard/stream-management?streamerId=${streamer.id}`
    });
    Assert.equal(page.statusCode, 200);
    Assert.match(page.result, /Editor access/);
    Assert.match(page.result, /Add a source/);
    Assert.match(page.result, /Create a StreamSession/);

    const mutation = await injectAuthenticated(context, editor, {
        method: 'POST',
        url: '/dashboard/stream-management/sources',
        payload: { streamerId: streamer.id, provider: 'twitch', channelId: 'editor-channel' }
    });
    Assert.equal(mutation.statusCode, 303);
    Assert.ok(await context.models.Source.query().findOne({ streamerId: streamer.id, channelId: 'editor-channel' }));
});
