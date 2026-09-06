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
        const routeFiles = require('node:fs').readdirSync(require('node:path').join(__dirname, '..', 'lib', 'routes'), { recursive: true })
            .filter((name) => name.endsWith('.js'));
        const routes = server.table();

        Assert.equal(server.info.started, 0);
        Assert.equal(routes.length, routeFiles.length);
        Assert.equal(new Set(routes.map(({ method, path }) => `${method}:${path}`)).size, routeFiles.length);
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
            ['GET', '/streamers/1/stream-sessions'],
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

    Test('viewer, editor, admin, and owner route permissions follow the capability matrix', async (t) => {
        const context = await Helpers.startServer(t);
        const owner = await Helpers.createUser(context, { email: 'owner@example.com' });
        const streamer = await Helpers.createTenant(context, owner, 'owner', { slug: 'roles' });
        const accounts = { owner };
        for (const role of ['viewer', 'editor', 'admin']) {
            accounts[role] = await Helpers.createUser(context, { email: `${role}@example.com` });
            await Helpers.addMembership(context, accounts[role], streamer, role);
        }

        for (const role of ['viewer', 'editor', 'admin', 'owner']) {
            const read = await Helpers.injectAuthenticated(context, accounts[role], { method: 'GET', url: `/streamers/${streamer.id}/commands` });
            Assert.equal(read.statusCode, 200, `${role} may read management data`);

            const sessions = await Helpers.injectAuthenticated(context, accounts[role], { method: 'GET', url: `/streamers/${streamer.id}/stream-sessions` });
            Assert.equal(sessions.statusCode, 200, `${role} may read sessions`);

            const createSession = await Helpers.injectAuthenticated(context, accounts[role], {
                method: 'POST', url: `/streamers/${streamer.id}/stream-sessions`, payload: { title: `${role} session` }
            });
            Assert.equal(createSession.statusCode, role === 'viewer' ? 403 : 201, `${role} manageStreams`);

            const source = await Helpers.injectAuthenticated(context, accounts[role], {
                method: 'POST', url: `/streamers/${streamer.id}/sources`, payload: { ...sourcePayload, channelId: `${role}-channel` }
            });
            Assert.equal(source.statusCode, role === 'viewer' ? 403 : 201, `${role} manageSources`);

            const memberships = await Helpers.injectAuthenticated(context, accounts[role], { method: 'GET', url: `/streamers/${streamer.id}/memberships` });
            Assert.equal(memberships.statusCode, ['admin', 'owner'].includes(role) ? 200 : 403, `${role} manageMemberships`);

            const deletion = await Helpers.injectAuthenticated(context, accounts[role], { method: 'DELETE', url: `/streamers/${streamer.id}` });
            Assert.equal(deletion.statusCode, role === 'owner' ? 204 : 403, `${role} deleteStreamer`);
            if (role === 'owner') break;
        }
    });

    Test('same-tenant operations succeed while cross-tenant access is indistinguishable from absence', async (t) => {
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
            method: 'POST', url: `/streamers/${aliceTenant.id}/commands`, payload: commandPayload
        });
        Assert.equal(created.statusCode, 201);
        const command = created.result;

        const sameTenant = await Helpers.injectAuthenticated(context, alice, {
            method: 'POST', url: '/streams', payload: { sourceId: source.id, streamSessionId: sessionResponse.result.id, title: 'Mine' }
        });
        Assert.equal(sameTenant.statusCode, 201);

        for (const request of [
            { method: 'GET', url: `/streamers/${aliceTenant.id}/commands` },
            { method: 'GET', url: `/streamers/${aliceTenant.id}/stream-sessions` },
            { method: 'PATCH', url: `/streamers/${aliceTenant.id}/commands/${command.id}`, payload: { responseTemplate: 'stolen' } },
            { method: 'DELETE', url: `/streams/${sameTenant.result.id}` }
        ]) {
            const response = await Helpers.injectAuthenticated(context, bob, request);
            Assert.equal(response.statusCode, 404);
            Assert.match(JSON.stringify(response.result), /not found/i);
        }

        const wrongPath = await Helpers.injectAuthenticated(context, bob, {
            method: 'PATCH', url: `/streamers/${bobTenant.id}/commands/${command.id}`, payload: { responseTemplate: 'stolen' }
        });
        Assert.equal(wrongPath.statusCode, 404);
        Assert.equal((await context.models.Command.query().findById(command.id)).responseTemplate, 'Hello!');

        const foreignSession = await context.models.StreamSession.query().insert({ streamerId: bobTenant.id, title: 'Bob session', status: 'scheduled' });
        const crossTenantStream = await Helpers.injectAuthenticated(context, alice, {
            method: 'POST', url: '/streams', payload: { sourceId: source.id, streamSessionId: foreignSession.id, title: 'Wrong tenant' }
        });
        Assert.equal(crossTenantStream.statusCode, 404);
    });

    Test('a stream source can change only within its existing tenant', async (t) => {
        const context = await Helpers.startServer(t);
        const user = await Helpers.createUser(context);
        const first = await Helpers.createTenant(context, user, 'owner', { slug: 'first' });
        const second = await Helpers.createTenant(context, user, 'owner', { slug: 'second' });
        const original = await Helpers.createSource(context, first);
        const sameTenant = await Helpers.createSource(context, first);
        const otherTenant = await Helpers.createSource(context, second);
        const session = await context.models.StreamSession.query().insert({ streamerId: first.id, title: 'Source move', status: 'scheduled' });
        const stream = await context.models.Stream.query().insert({ sourceId: original.id, streamSessionId: session.id, status: 'scheduled' });

        const allowed = await Helpers.injectAuthenticated(context, user, { method: 'PATCH', url: `/streams/${stream.id}`, payload: { sourceId: sameTenant.id } });
        Assert.equal(allowed.statusCode, 200);
        const denied = await Helpers.injectAuthenticated(context, user, { method: 'PATCH', url: `/streams/${stream.id}`, payload: { sourceId: otherTenant.id } });
        Assert.equal(denied.statusCode, 404);
        Assert.equal((await context.models.Stream.query().findById(stream.id)).sourceId, sameTenant.id);
    });

    Test('dashboard queries and rendered data contain only the caller memberships', async (t) => {
        const context = await Helpers.startServer(t);
        const user = await Helpers.createUser(context, { displayName: 'Dashboard User' });
        const own = await Helpers.createTenant(context, user, 'viewer', { slug: 'visible-tenant', displayName: 'Visible Tenant' });
        const stranger = await Helpers.createUser(context);
        await Helpers.createTenant(context, stranger, 'owner', { slug: 'secret-tenant', displayName: 'Secret Tenant' });
        await Helpers.createSource(context, own);

        const response = await Helpers.injectAuthenticated(context, user, { method: 'GET', url: '/dashboard' });
        Assert.equal(response.statusCode, 200);
        Assert.match(response.payload, /Visible Tenant/);
        Assert.doesNotMatch(response.payload, /Secret Tenant/);
    });

    Test('deleting users and streamers cascades dependents without foreign-key violations', async (t) => {
        const context = await Helpers.startServer(t);
        const owner = await Helpers.createUser(context);
        const streamer = await Helpers.createTenant(context, owner);
        const source = await Helpers.createSource(context, streamer);
        const session = await context.models.StreamSession.query().insert({ streamerId: streamer.id, title: 'Cascade', status: 'scheduled' });
        await context.models.Stream.query().insert({ sourceId: source.id, streamSessionId: session.id, status: 'live' });
        await context.models.Command.query().insert({ streamerId: streamer.id, ...commandPayload });

        const removed = await Helpers.injectAuthenticated(context, owner, { method: 'DELETE', url: `/streamers/${streamer.id}` });
        Assert.equal(removed.statusCode, 204);
        for (const table of ['Streamer', 'StreamerMembership', 'Source', 'StreamSession', 'Stream', 'Command']) {
            Assert.equal(Number((await context.knex(table).count({ count: '*' }).first()).count), 0, table);
        }
        await context.models.User.query().deleteById(owner.user.id);
        Assert.equal(Number((await context.knex('Session').count({ count: '*' }).first()).count), 0);
        Assert.deepEqual(await context.knex.raw('PRAGMA foreign_key_check'), []);
    });
}
