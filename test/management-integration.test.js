'use strict';

const Assert = require('node:assert/strict');
const Test = require('node:test');

let dependenciesAvailable = true;
try {
    require.resolve('@hapi/hapi');
    require.resolve('better-sqlite3');
}
catch {
    dependenciesAvailable = false;
}

if (!dependenciesAvailable) {
    Test('management integration assertions (database dependencies unavailable)', { skip: true }, () => {});
}
else {
    const Helpers = require('./helpers/server');
    const commandPayload = { name: 'hello', responseTemplate: 'Hello!', enabled: true, cooldownSeconds: 0 };
    const sourcePayload = { provider: 'twitch', channelId: 'new-channel', enabled: true };

    Test('the initialized server discovers every route module without binding a port', async (t) => {
        const { server } = await Helpers.startServer(t);
        const routeFiles = require('node:fs').readdirSync(require('node:path').join(__dirname, '..', 'lib', 'routes'), { recursive: true }).filter((name) => name.endsWith('.js'));
        Assert.equal(server.info.started, 0);
        Assert.equal(server.table().length, routeFiles.length);
    });

    Test('unauthenticated management requests are rejected by the session strategy', async (t) => {
        const context = await Helpers.startServer(t);
        const protectedRequests = [
            ['POST', '/streamers', { slug: 'nope', displayName: 'Nope' }],
            ['PATCH', '/streamers/1', { displayName: 'Nope' }],
            ['DELETE', '/streamers/1'],
            ['POST', '/streamers/1/sources', sourcePayload],
            ['GET', '/streamers/1/commands'],
            ['POST', '/streamers/1/stream-sessions', { title: 'Nope' }],
            ['POST', '/streams', { sourceId: 1, streamSessionId: 1 }],
            ['PATCH', '/streams/1', { title: 'Nope' }],
            ['GET', '/streamers/1/memberships'],
            ['GET', '/dashboard']
        ];
        for (const [method, url, payload] of protectedRequests) {
            const response = await context.server.inject({ method, url, payload });
            Assert.equal(response.statusCode, 302, `${method} ${url}`);
            Assert.match(response.headers.location, /^\/login/);
        }
    });

    Test('same-tenant stream creation requires a same-tenant StreamSession', async (t) => {
        const context = await Helpers.startServer(t);
        const alice = await Helpers.createUser(context, { email: 'alice@example.com' });
        const bob = await Helpers.createUser(context, { email: 'bob@example.com' });
        const aliceTenant = await Helpers.createTenant(context, alice, 'owner', { slug: 'alice' });
        const bobTenant = await Helpers.createTenant(context, bob, 'owner', { slug: 'bob' });
        const source = await Helpers.createSource(context, aliceTenant);

        const sessionResponse = await Helpers.injectAuthenticated(context, alice, {
            method: 'POST', url: `/streamers/${aliceTenant.id}/stream-sessions`, payload: { title: 'Alice session' }
        });
        Assert.equal(sessionResponse.statusCode, 201);
        const created = await Helpers.injectAuthenticated(context, alice, {
            method: 'POST', url: '/streams', payload: { sourceId: source.id, streamSessionId: sessionResponse.result.id, title: 'Mine' }
        });
        Assert.equal(created.statusCode, 201);

        const foreignSession = await context.models.StreamSession.query().insert({ streamerId: bobTenant.id, title: 'Bob session' });
        const crossTenant = await Helpers.injectAuthenticated(context, alice, {
            method: 'POST', url: '/streams', payload: { sourceId: source.id, streamSessionId: foreignSession.id, title: 'Wrong' }
        });
        Assert.equal(crossTenant.statusCode, 404);
    });

    Test('a stream source can change only within its existing tenant', async (t) => {
        const context = await Helpers.startServer(t);
        const user = await Helpers.createUser(context);
        const first = await Helpers.createTenant(context, user, 'owner', { slug: 'first' });
        const second = await Helpers.createTenant(context, user, 'owner', { slug: 'second' });
        const original = await Helpers.createSource(context, first);
        const sameTenant = await Helpers.createSource(context, first);
        const otherTenant = await Helpers.createSource(context, second);
        const session = await context.models.StreamSession.query().insert({ streamerId: first.id, title: 'Source move' });
        const stream = await context.models.Stream.query().insert({ sourceId: original.id, streamSessionId: session.id, status: 'scheduled' });

        const allowed = await Helpers.injectAuthenticated(context, user, { method: 'PATCH', url: `/streams/${stream.id}`, payload: { sourceId: sameTenant.id } });
        Assert.equal(allowed.statusCode, 200);
        const denied = await Helpers.injectAuthenticated(context, user, { method: 'PATCH', url: `/streams/${stream.id}`, payload: { sourceId: otherTenant.id } });
        Assert.equal(denied.statusCode, 404);
        Assert.equal((await context.models.Stream.query().findById(stream.id)).sourceId, sameTenant.id);
    });

    Test('deleting a streamer cascades its session-scoped streaming records', async (t) => {
        const context = await Helpers.startServer(t);
        const owner = await Helpers.createUser(context);
        const streamer = await Helpers.createTenant(context, owner);
        const source = await Helpers.createSource(context, streamer);
        const session = await context.models.StreamSession.query().insert({ streamerId: streamer.id, title: 'Cascade' });
        await context.models.Stream.query().insert({ sourceId: source.id, streamSessionId: session.id, status: 'live' });
        await context.models.Command.query().insert({ streamerId: streamer.id, ...commandPayload });

        const removed = await Helpers.injectAuthenticated(context, owner, { method: 'DELETE', url: `/streamers/${streamer.id}` });
        Assert.equal(removed.statusCode, 204);
        for (const table of ['Streamer', 'StreamerMembership', 'Source', 'StreamSession', 'Stream', 'Command']) {
            Assert.equal(Number((await context.knex(table).count({ count: '*' }).first()).count), 0, table);
        }
        Assert.deepEqual(await context.knex.raw('PRAGMA foreign_key_check'), []);
    });
}
