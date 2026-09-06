'use strict';

const Assert = require('node:assert/strict');
const Test = require('node:test');
const { addMembership, createSource, createTenant, createUser, injectAuthenticated, startServer } = require('./helpers/server');

Test('owner dashboard renders the selected creator management overview', async (t) => {
    const context = await startServer(t);
    const owner = await createUser(context, { displayName: 'Owner Account' });
    const streamer = await createTenant(context, owner, 'owner', { displayName: 'Primary Creator', slug: 'primary' });
    await createTenant(context, owner, 'owner', { displayName: 'Backup Creator', slug: 'backup' });
    const helper = await createUser(context, { displayName: 'Helper Account' });
    await addMembership(context, helper, streamer, 'viewer');
    const twitch = await createSource(context, streamer, { provider: 'twitch', channelId: 'primary-twitch' });
    await createSource(context, streamer, { provider: 'youtube', channelId: 'primary-youtube', enabled: false });
    const session = await context.services.streamingService.createStreamSession(owner.user.id, streamer.id, 'manageStreams', { title: 'Launch Show', status: 'live', startedAt: '2026-09-06T20:00:00.000Z' });
    await context.services.streamingService.createStream(owner.user.id, 'manageStreams', { sourceId: twitch.id, streamSessionId: session.id, externalId: 'launch-live', title: 'Launch Show', status: 'live', startedAt: '2026-09-06T20:00:00.000Z' });
    await context.services.streamingService.createCommand(owner.user.id, streamer.id, 'manageCommands', { name: 'hello', responseTemplate: 'Hello there', cooldownSeconds: 15, cooldownScope: 'participant', requiredChatRole: 'moderator' });
    await context.services.rewardService.createReward(owner.user.id, streamer.id, { name: 'Hydrate', description: 'Take a sip', pointCost: 50, enabled: true, fulfillmentType: 'manual', perUserCooldownSeconds: null, globalCooldownSeconds: null, perStreamLimit: null, eligibilityPolicy: { membership: 'any', providers: [] }, executorConfiguration: {} });
    await context.models.EarningPolicy.query().insert({ streamerId: streamer.id, eventType: 'participationInterval', name: 'Watch time', points: 5, perSessionCap: null, perDayCap: null, enabled: true });
    await context.models.AiFeatureConfiguration.query().insert({ streamerId: streamer.id, enabled: true, invocationCommand: 'ask', provider: 'openai', model: 'gpt-5', configurationVersion: 'dashboard-v1', pricingPolicy: { type: 'fixed', pointCost: 25 }, cooldownSeconds: 10, cooldownScope: 'participant', maxInputChars: 2000, maxOutputChars: 2000, maxOutputTokenCount: 512, timeoutMs: 5000 });
    const response = await injectAuthenticated(context, owner, { method: 'GET', url: `/dashboard?streamerId=${streamer.id}` });
    Assert.equal(response.statusCode, 200);
    for (const expected of ['Primary Creator', 'Backup Creator', 'Launch Show', 'Twitch', 'YouTube', '!hello', 'Helper Account', 'Hydrate', 'Watch time', '!ask', 'gpt-5', 'Can manage']) Assert.match(response.result, new RegExp(expected.replace(/[!]/g, '\\!')));
    Assert.match(response.result, /\/assets\/styles\/streamzone\.css/);
});

Test('viewer dashboard keeps team details capability restricted', async (t) => {
    const context = await startServer(t);
    const owner = await createUser(context, { displayName: 'Owner Account' });
    const viewer = await createUser(context, { displayName: 'Read Only Account' });
    const streamer = await createTenant(context, owner, 'owner', { displayName: 'Shared Creator', slug: 'shared' });
    await addMembership(context, viewer, streamer, 'viewer');
    const response = await injectAuthenticated(context, viewer, { method: 'GET', url: `/dashboard?streamerId=${streamer.id}` });
    Assert.equal(response.statusCode, 200);
    Assert.match(response.result, /Viewer access/);
    Assert.match(response.result, /Read only/);
    Assert.match(response.result, /Team details are restricted/);
    Assert.doesNotMatch(response.result, /Owner Account/);
});

Test('dashboard has a strong empty state for accounts without a creator membership', async (t) => {
    const context = await startServer(t);
    const account = await createUser(context, { displayName: 'Unassigned Account' });
    const response = await injectAuthenticated(context, account, { method: 'GET', url: '/dashboard' });
    Assert.equal(response.statusCode, 200);
    Assert.match(response.result, /No creator workspace yet/);
});

Test('dashboard returns not found for an inaccessible creator selection', async (t) => {
    const context = await startServer(t);
    const account = await createUser(context);
    await createTenant(context, account, 'owner');
    const response = await injectAuthenticated(context, account, { method: 'GET', url: '/dashboard?streamerId=999999' });
    Assert.equal(response.statusCode, 404);
    Assert.equal(response.result, 'Streamer not found');
});

Test('Streamzone stylesheet is served without authentication', async (t) => {
    const context = await startServer(t);
    const response = await context.server.inject({ method: 'GET', url: '/assets/styles/streamzone.css' });
    Assert.equal(response.statusCode, 200);
    Assert.match(response.headers['content-type'], /^text\/css/);
    Assert.match(response.result, /\.management-shell/);
});
