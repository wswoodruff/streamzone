'use strict';

const Assert = require('node:assert/strict');
const Test = require('node:test');
const Knex = require('knex');
const YouTubeAdapter = require('../lib/providers/youtube/adapter');
const DurableRuntimeStore = require('../lib/runtime/durable-store');
const ProductionRuntime = require('../lib/runtime/production-runtime');
const migration = require('../migrations/004-production-runtime');

const response = (status, body, headers = {}) => ({ status, ok: status >= 200 && status < 300, headers: { get: (name) => headers[name.toLowerCase()] }, json: async () => body });

Test('YouTube chat adapter follows pagination/intervals, normalizes authors, and sends replies', async () => {
    const calls = [];
    const adapter = new YouTubeAdapter({ fetch: async (url, options) => {
        calls.push({ url, options });
        if (options.method === 'POST') return response(200, { id: 'reply-1' });
        return response(200, { nextPageToken: 'next', pollingIntervalMillis: 250, items: [{ id: 'event-1', snippet: { displayMessage: '!hello Ada', publishedAt: '2026-09-07T12:00:00Z' }, authorDetails: { channelId: 'UC-author', displayName: 'Ada', isChatModerator: true } }] });
    } });
    const page = await adapter.pollChat('token', 'chat/id', 'previous');
    Assert.equal(page.nextPageToken, 'next'); Assert.equal(page.pollingIntervalMs, 1000);
    Assert.deepEqual(page.events[0].relationships, ['moderator']); Assert.equal(page.events[0].providerUserId, 'UC-author');
    Assert.match(calls[0].url, /pageToken=previous/); Assert.match(calls[0].url, /liveChatId=chat%2Fid/);
    const sent = await adapter.sendChatMessage('token', 'chat/id', 'Hello Ada');
    Assert.equal(sent.id, 'reply-1'); Assert.ok(!Number.isNaN(new Date(sent.sentAt).getTime()));
    Assert.equal(JSON.parse(calls[1].options.body).snippet.textMessageDetails.messageText, 'Hello Ada');
    await Assert.rejects(() => adapter.sendChatMessage('token', 'chat', 'x'.repeat(201)), (error) => error.code === 'MESSAGE_LENGTH');
});

Test('durable event claims and cursors survive worker restart and reject duplicate pages', async () => {
    const knex = Knex({ client: 'better-sqlite3', connection: { filename: ':memory:' }, useNullAsDefault: true });
    await migration.up(knex);
    const first = new DurableRuntimeStore(knex, { ownerId: 'worker-1', leaseMs: 10 });
    Assert.equal(await first.claimEvent('youtube:event-1', 100), true);
    await first.completeEvent('youtube:event-1', { type: 'fulfilled' }, false, 101);
    await first.saveCursor('youtube:1:chat', 'page-2', 2500, 102);
    const restarted = new DurableRuntimeStore(knex, { ownerId: 'worker-2', leaseMs: 10 });
    Assert.equal(await restarted.claimEvent('youtube:event-1', 1000), false);
    Assert.equal((await restarted.cursor('youtube:1:chat')).pageToken, 'page-2');
    Assert.equal(await first.acquireLease('connection:1', 200), true);
    Assert.equal(await restarted.acquireLease('connection:1', 201), false);
    Assert.equal(await restarted.acquireLease('connection:1', 211), true);
    await knex.destroy();
});

Test('fake-provider end to end: YouTube event becomes ChatMessage, command, ChatResponse, and send', async () => {
    const records = new Map(); const deliveries = new Map(); const sent = [];
    const store = {
        claimEvent: async (key) => { if (records.has(key)) return false; records.set(key, 'processing'); return true; },
        completeEvent: async (key, outcome) => records.set(key, outcome.type), consumeCooldown: async () => ({ allowed: true, retryAfterMs: 0 }),
        beginDelivery: async (key) => ({ eventKey: key, status: deliveries.get(key) || 'sending', attempts: 1 }),
        finishDelivery: async (key, status) => deliveries.set(key, status)
    };
    const adapter = { sendChatMessage: async (_token, chat, text) => { sent.push({ chat, text }); return { id: 'youtube-reply-1' }; } };
    const Source = { query: () => ({ findOne: async () => ({ id: 7, channelId: 'UC-streamer' }) }) };
    const Command = { query: () => ({ findOne: async () => ({ id: 8, name: 'hello', responseTemplate: 'Hello {{user}}: {{args}}', enabled: true, cooldownSeconds: 0, cooldownScope: 'streamer', requiredChatRole: 'everyone' }) }) };
    const runtime = new ProductionRuntime({ server: { models: () => ({ Source, Command }), services: () => ({}) }, adapter, store, tokenProvider: async () => 'token', sleep: async () => {} });
    runtime.resolveIdentity = async () => ({ id: 9, chatUserId: 10, displayName: 'Ada', handle: '@ada' });
    runtime.resolveRelationships = async () => [];
    runtime.resolveSession = async () => ({ streamerId: 11, streamSessionId: 12, participantId: 13 });
    runtime.account = async () => ({});
    const result = await runtime.processEvent({ connection: { id: 1, sourceId: 7 }, broadcast: { id: 'broadcast-1' }, liveChatId: 'chat-1', token: 'token', event: { id: 'event-1', providerUserId: 'UC-ada', text: '!hello world', occurredAt: '2026-09-07T12:00:00Z', author: { displayName: 'Ada' }, relationships: [] } });
    Assert.equal(result.message.constructor.name, 'ChatMessage'); Assert.equal(result.outcome.type, 'fulfilled');
    Assert.equal(result.response.constructor.name, 'ChatResponse'); Assert.deepEqual(sent, [{ chat: 'chat-1', text: 'Hello Ada: world' }]);
    Assert.equal(records.get('youtube:event-1'), 'fulfilled'); Assert.equal(deliveries.get('youtube:event-1'), 'sent');
    Assert.deepEqual(await runtime.processEvent({ event: { id: 'event-1' } }), { duplicate: true });
});
