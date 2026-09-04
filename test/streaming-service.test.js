'use strict';

const Assert = require('node:assert/strict');
const Module = require('node:module');
const Test = require('node:test');

const loadService = () => {
    const originalLoad = Module._load;

    Module._load = (request, parent, isMain) => {
        if (request === '@hapipal/schmervice') {
            return { Service: class {} };
        }

        return originalLoad(request, parent, isMain);
    };

    try {
        return require('../lib/services/streaming-service');
    }
    finally {
        Module._load = originalLoad;
    }
};

Test('a source cannot be added for an unknown streamer', async () => {
    const StreamingService = loadService();
    const service = new StreamingService();

    service.server = {
        models: () => ({
            Streamer: { query: () => ({ findById: async () => undefined }) },
            Source: { query: () => ({ insert: () => Assert.fail('should not insert') }) }
        })
    };

    Assert.equal(await service.addSource(404, { provider: 'youtube', channelId: 'channel' }), null);
});

Test('a source is associated with its hosted streamer', async () => {
    const StreamingService = loadService();
    const service = new StreamingService();
    let inserted;

    service.server = {
        models: () => ({
            Streamer: { query: () => ({ findById: async () => ({ id: 7 }) }) },
            Source: {
                query: () => ({
                    insert: async (source) => {
                        inserted = source;
                        return source;
                    }
                })
            }
        })
    };

    await service.addSource(7, { provider: 'twitch', channelId: 'creator' });

    Assert.deepEqual(inserted, { provider: 'twitch', channelId: 'creator', streamerId: 7 });
});

Test('a command cannot be added for an unknown streamer', async () => {
    const service = new (loadService())();
    service.server = { models: () => ({
        Streamer: { query: () => ({ findById: async () => undefined }) },
        Command: { query: () => ({ insert: () => Assert.fail('should not insert') }) }
    }) };

    Assert.equal(await service.createCommand(404, { name: 'hello', responseTemplate: 'Hi!' }), null);
});

Test('a command is normalized and scoped to its streamer', async () => {
    const service = new (loadService())();
    let inserted;
    service.server = { models: () => ({
        Streamer: { query: () => ({ findById: async () => ({ id: 9 }) }) },
        Command: { query: () => ({ insert: async (record) => (inserted = record) }) }
    }) };

    await service.createCommand(9, { name: 'EightBall', responseTemplate: '{{user}}, yes.' });

    Assert.deepEqual(inserted, {
        name: 'eightball', responseTemplate: '{{user}}, yes.', streamerId: 9
    });
});
