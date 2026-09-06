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
        services: () => ({ authorizationService: {
            requireCapability: async (...args) => (authorizationArgs = args)
        } }),
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
        services: () => ({ authorizationService: {
            requireCapability: async (...args) => (authorizationArgs = args)
        } }),
        models: () => ({ Command: { query: () => ({ insert: async (record) => (inserted = record) }) } })
    };

    await service.createCommand(4, 9, 'manageCommands', { name: 'EightBall', responseTemplate: 'Yes.' });
    Assert.deepEqual(authorizationArgs, [4, 9, 'manageCommands']);
    Assert.deepEqual(inserted, { name: 'eightball', responseTemplate: 'Yes.', streamerId: 9 });
});

Test('stream updates authorize through the stream source hierarchy', async () => {
    const service = new (loadService())();
    let authorizationArgs;
    service.server = {
        services: () => ({ authorizationService: {
            requireStreamCapability: async (...args) => (authorizationArgs = args)
        } }),
        models: () => ({ Stream: { query: () => ({ patchAndFetchById: async () => ({ id: 12 }) }) } })
    };

    await service.updateStream(2, 12, 'manageStreams', { title: 'Updated' });
    Assert.deepEqual(authorizationArgs, [2, 12, 'manageStreams']);
});
