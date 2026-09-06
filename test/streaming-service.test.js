'use strict';

const Assert = require('node:assert/strict');
const Module = require('node:module');
const Test = require('node:test');

const loadService = () => {
    const originalLoad = Module._load;
    Module._load = (request, parent, isMain) => request === '@hapipal/schmervice' ? { Service: class {} } : originalLoad(request, parent, isMain);
    try { return require('../lib/services/streaming-service'); }
    finally { Module._load = originalLoad; }
};

Test('source creation delegates tenant authorization and associates the streamer', async () => {
    const service = new (loadService())();
    let authorizationArgs;
    let inserted;
    service.server = {
        services: () => ({ authorizationService: { requireCapability: async (...args) => (authorizationArgs = args) } }),
        models: () => ({ Source: { query: () => ({ insert: async (record) => (inserted = record) }) } })
    };
    await service.addSource(3, 7, 'manageSources', { provider: 'twitch', channelId: 'creator' });
    Assert.deepEqual(authorizationArgs, [3, 7, 'manageSources']);
    Assert.deepEqual(inserted, { provider: 'twitch', channelId: 'creator', streamerId: 7 });
});

Test('command creation delegates tenant authorization and normalizes its name', async () => {
    const service = new (loadService())();
    let authorizationArgs;
    let inserted;
    service.server = {
        services: () => ({ authorizationService: { requireCapability: async (...args) => (authorizationArgs = args) } }),
        models: () => ({ Command: { query: () => ({ insert: async (record) => (inserted = record) }) } })
    };
    await service.createCommand(4, 9, 'manageCommands', { name: 'EightBall', responseTemplate: 'Yes.' });
    Assert.deepEqual(authorizationArgs, [4, 9, 'manageCommands']);
    Assert.deepEqual(inserted, { name: 'eightball', responseTemplate: 'Yes.', streamerId: 9 });
});

Test('stream updates authorize through the stream source hierarchy and reconcile the required session', async () => {
    const service = new (loadService())();
    let authorizationArgs;
    let reconciled;
    const transaction = {};
    const Stream = {
        transaction: (operation) => operation(transaction),
        query: (usedTransaction) => {
            Assert.equal(usedTransaction, transaction);
            return { patchAndFetchById: async () => ({ id: 12, streamSessionId: 21 }) };
        }
    };
    service.reconcileStreamSession = async (...args) => (reconciled = args);
    service.server = {
        services: () => ({ authorizationService: {
            requireStreamCapability: async (...args) => {
                authorizationArgs = args;
                return { sourceId: 4, streamSessionId: 21, source: { streamerId: 5 } };
            }
        } }),
        models: () => ({ Stream, Source: {} })
    };
    await service.updateStream(2, 12, 'manageStreams', { title: 'Updated' });
    Assert.deepEqual(authorizationArgs, [2, 12, 'manageStreams', transaction]);
    Assert.deepEqual(reconciled, [21, transaction]);
});

const transactionalModels = ({ rejectMembership = false } = {}) => {
    const state = { streamers: [], memberships: [] };
    const Streamer = {
        transaction: async (operation) => {
            const transaction = {
                streamers: state.streamers.map((row) => ({ ...row })),
                memberships: state.memberships.map((row) => ({ ...row }))
            };
            const result = await operation(transaction);
            state.streamers = transaction.streamers;
            state.memberships = transaction.memberships;
            return result;
        },
        query: (transaction) => ({
            insert: async (streamer) => {
                const created = { id: transaction.streamers.length + 1, ...streamer };
                transaction.streamers.push(created);
                return created;
            }
        })
    };
    const StreamerMembership = {
        query: (transaction) => ({
            insert: async (membership) => {
                if (rejectMembership) throw new Error('membership insert failed');
                transaction.memberships.push(membership);
                return membership;
            }
        })
    };
    return { state, Streamer, StreamerMembership };
};

Test('streamer creation returns its owner membership from the same transaction', async () => {
    const models = transactionalModels();
    const service = new (loadService())();
    service.server = { models: () => models };
    const result = await service.createStreamer(8, { slug: 'creator', displayName: 'Creator' });
    Assert.deepEqual(result, {
        streamer: { id: 1, slug: 'creator', displayName: 'Creator' },
        membership: { userId: 8, streamerId: 1, role: 'owner' }
    });
    Assert.deepEqual(models.state.streamers, [result.streamer]);
    Assert.deepEqual(models.state.memberships, [result.membership]);
});

Test('failed owner membership creation rolls back the streamer insert', async () => {
    const models = transactionalModels({ rejectMembership: true });
    const service = new (loadService())();
    service.server = { models: () => models };
    await Assert.rejects(service.createStreamer(8, { slug: 'orphan', displayName: 'Orphan' }), /membership insert failed/);
    Assert.deepEqual(models.state.streamers, []);
    Assert.deepEqual(models.state.memberships, []);
});

Test('streamer creation route passes the authenticated user ID and returns both records', async () => {
    const originalLoad = Module._load;
    Module._load = (request, parent, isMain) => request === '../../validation/streamers' ? { payload: {} } : originalLoad(request, parent, isMain);
    let route;
    try { route = require('../lib/routes/streamers/create'); }
    finally { Module._load = originalLoad; }
    let args;
    const expected = { streamer: { id: 4 }, membership: { userId: 17, streamerId: 4, role: 'owner' } };
    const request = {
        auth: { credentials: { id: 17 } },
        payload: { slug: 'creator', displayName: 'Creator' },
        services: () => ({ streamingService: { createStreamer: async (...values) => {
            args = values;
            return expected;
        } } })
    };
    const response = { code: (statusCode) => ({ statusCode, source: expected }) };
    const result = await route.handler(request, { response: () => response });
    Assert.deepEqual(args, [17, request.payload]);
    Assert.deepEqual(result, { statusCode: 201, source: expected });
});
