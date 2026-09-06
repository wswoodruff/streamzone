'use strict';

const Assert = require('node:assert/strict');
const Test = require('node:test');
const { startServer } = require('./helpers/server');
const TestConsoleRuntime = require('../tools/test-console/runtime');
const ConsoleAiProvider = require('../tools/test-console/mock-ai-provider');

Test('test console simulates multiple terminals against shared runtime state and standalone AI', async (t) => {
    const context = await startServer(t);
    context.server.app.aiProvider = new ConsoleAiProvider();
    const runtime = new TestConsoleRuntime(context.server);
    const streamer = await context.models.Streamer.query().insert({ slug: 'console-streamer', displayName: 'Console Streamer' });
    const source = await context.models.Source.query().insert({ streamerId: streamer.id, provider: 'twitch', channelId: 'console-channel', enabled: true });
    const session = await context.models.StreamSession.query().insert({
        streamerId: streamer.id,
        title: 'Console Session',
        status: 'live',
        scheduledAt: null,
        startedAt: new Date().toISOString(),
        endedAt: null,
        publicMetadata: null
    });
    const stream = await context.models.Stream.query().insert({
        sourceId: source.id,
        streamSessionId: session.id,
        externalId: 'console-live',
        title: 'Console Live',
        status: 'live',
        startedAt: new Date().toISOString(),
        endedAt: null
    });
    await context.models.Command.query().insert({
        streamerId: streamer.id,
        name: 'hello',
        responseTemplate: 'Hello {{user}}: {{args}}',
        enabled: true,
        cooldownSeconds: 30,
        cooldownScope: 'participant'
    });

    const first = await runtime.attach({ streamId: stream.id, username: 'viewer-one', displayName: 'Viewer One', relationships: ['follower'] });
    const fulfilled = await runtime.message(first.client.id, '!hello world');
    Assert.equal(fulfilled.outcome.type, 'fulfilled');
    Assert.equal(fulfilled.response.text, 'Hello Viewer One: world');

    const second = await runtime.attach({ streamId: stream.id, chatIdentityId: first.client.chatIdentityId });
    const cooledDown = await runtime.message(second.client.id, '!hello again');
    Assert.equal(cooledDown.outcome.type, 'cooldown');

    await runtime.adjustPoints(first.client.id, 50);
    const configured = await runtime.configureAi(first.client.id, {
        invocationCommand: 'ai', provider: 'console', model: 'mock', pointCost: 5,
        cooldownSeconds: 0, cooldownScope: 'participant', instruction: 'Answer briefly and safely.'
    });
    Assert.equal(configured.aiFeature.streamerId, streamer.id);
    Assert.equal(configured.aiFeature.pricingPolicy.pointCost, 5);

    const ai = await runtime.message(first.client.id, '!ai hello from the console');
    Assert.equal(ai.outcome.type, 'fulfilled');
    Assert.match(ai.response.text, /^\[mock ai\/mock\]/);
    Assert.equal(ai.balance.availableBalance, 45);
    const invocation = await context.models.AiInvocation.query().findById(ai.ai.invocation.id);
    Assert.equal(invocation.status, 'succeeded');
    Assert.equal(invocation.quotedPointCost, 5);
});
