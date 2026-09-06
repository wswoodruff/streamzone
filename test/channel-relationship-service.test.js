'use strict';

const Assert = require('node:assert/strict');
const Test = require('node:test');
const { startServer, createSource, createTenant, createUser } = require('./helpers/server');
let dependenciesAvailable = true;
try {
    require.resolve('@hapi/hapi');
    require.resolve('better-sqlite3');
}
catch {
    dependenciesAvailable = false;
}

Test('adapter observations upsert normalized relationships without writing memberships', { skip: !dependenciesAvailable && 'database dependencies unavailable' }, async (t) => {
    const context = await startServer(t);
    const owner = await createUser(context);
    const streamer = await createTenant(context, owner);
    const source = await createSource(context, streamer);
    const membershipsBefore = await context.models.StreamerMembership.query().resultSize();

    const identity = await context.services.chatIdentityService.resolve({
        provider: 'twitch', providerUserId: 'viewer-1', handle: 'viewer',
        lastSeenAt: '2026-09-06T10:00:00.000Z'
    }, {
        sourceId: source.id,
        observedAt: '2026-09-06T10:00:00.000Z',
        facts: [
            { relationship: 'follower' },
            { relationship: 'subscriber', tier: 'tier_2', expiresAt: '2026-09-06T11:00:00.000Z' }
        ]
    });

    let rows = await context.models.ChannelRelationship.query().where({ sourceId: source.id, chatIdentityId: identity.id });
    Assert.deepEqual(rows.map(({ relationship }) => relationship).sort(), ['follower', 'subscriber']);
    Assert.equal(rows.find(({ relationship }) => relationship === 'subscriber').tier, 'tier_2');

    await context.services.channelRelationshipService.upsert({
        sourceId: source.id, chatIdentityId: identity.id,
        observedAt: '2026-09-06T10:05:00.000Z',
        facts: [{ relationship: 'subscriber', tier: 'prime' }]
    });
    rows = await context.models.ChannelRelationship.query().where({ sourceId: source.id, chatIdentityId: identity.id });
    Assert.equal(rows.length, 1, 'facts omitted from an authoritative snapshot are removed');
    Assert.equal(rows[0].tier, 'prime');
    Assert.equal(new Date(rows[0].observedAt).toISOString(), '2026-09-06T10:05:00.000Z');
    Assert.equal(await context.models.StreamerMembership.query().resultSize(), membershipsBefore);
});

Test('policy evaluation excludes expired and stale relationship facts', { skip: !dependenciesAvailable && 'database dependencies unavailable' }, async (t) => {
    const context = await startServer(t);
    const owner = await createUser(context);
    const source = await createSource(context, await createTenant(context, owner));
    const identity = await context.services.chatIdentityService.resolve({
        provider: 'twitch', providerUserId: 'viewer-2', lastSeenAt: '2026-09-06T10:00:00.000Z'
    });
    const service = context.services.channelRelationshipService;

    await service.upsert({ sourceId: source.id, chatIdentityId: identity.id, observedAt: '2026-09-06T10:00:00.000Z', facts: [
        { relationship: 'moderator' },
        { relationship: 'vip', expiresAt: '2026-09-06T10:05:00.000Z' }
    ] });
    Assert.deepEqual((await service.activeFor(source.id, identity.id, { asOf: '2026-09-06T10:04:00.000Z' })).map((row) => row.relationship).sort(), ['moderator', 'vip']);
    Assert.deepEqual((await service.activeFor(source.id, identity.id, { asOf: '2026-09-06T10:06:00.000Z' })).map((row) => row.relationship), ['moderator']);
    Assert.deepEqual(await service.activeFor(source.id, identity.id, { asOf: '2026-09-06T10:16:00.000Z' }), []);
});

Test('relationships remain isolated by source', { skip: !dependenciesAvailable && 'database dependencies unavailable' }, async (t) => {
    const context = await startServer(t);
    const owner = await createUser(context);
    const streamer = await createTenant(context, owner);
    const first = await createSource(context, streamer, { channelId: 'one' });
    const second = await createSource(context, streamer, { channelId: 'two' });
    const identity = await context.services.chatIdentityService.resolve({ provider: 'twitch', providerUserId: 'viewer-3' });
    const common = { chatIdentityId: identity.id, observedAt: '2026-09-06T10:00:00.000Z' };
    await context.services.channelRelationshipService.upsert({ ...common, sourceId: first.id, facts: [{ relationship: 'broadcaster' }] });
    await context.services.channelRelationshipService.upsert({ ...common, sourceId: second.id, facts: [{ relationship: 'paid_member' }] });
    Assert.deepEqual((await context.services.channelRelationshipService.activeFor(first.id, identity.id, { asOf: '2026-09-06T10:01:00.000Z' })).map((row) => row.relationship), ['broadcaster']);
    Assert.deepEqual((await context.services.channelRelationshipService.activeFor(second.id, identity.id, { asOf: '2026-09-06T10:01:00.000Z' })).map((row) => row.relationship), ['paid_member']);
});
