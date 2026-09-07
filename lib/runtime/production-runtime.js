'use strict';

const Crypto = require('node:crypto');
const { ChatMessage, ChatResponse } = require('./contracts');
const { InteractionPipeline } = require('./pipeline');
const stages = require('./stages');
const { renderCommandTemplate } = require('./template-renderer');

const COMMAND = /^!([a-z0-9][a-z0-9_-]*)(?:\s+([\s\S]*))?$/i;
const sleep = (ms, signal) => new Promise((resolve) => { const timer = setTimeout(resolve, ms); signal?.addEventListener('abort', () => { clearTimeout(timer); resolve(); }, { once: true }); });

module.exports = class ProductionRuntime {
    constructor({ server, adapter, store, tokenProvider, ownerId = Crypto.randomUUID(), now = () => Date.now(), sleep: wait = sleep, logger = console, maxSendAttempts = 4 }) {
        if (!server || !adapter || !store || !tokenProvider) throw new TypeError('server, adapter, store, and tokenProvider are required.');
        this.server = server; this.adapter = adapter; this.store = store; this.tokenProvider = tokenProvider;
        this.ownerId = ownerId; this.now = now; this.wait = wait; this.logger = logger; this.maxSendAttempts = maxSendAttempts;
        this.controller = null; this.tasks = new Set();
        this.pipeline = new InteractionPipeline({
            deduplication: async () => {},
            identityResolution: stages.identityResolution({ resolve: (message) => this.resolveIdentity(message) }),
            relationshipRefresh: stages.relationshipRefresh({ refresh: (message, identity) => this.resolveRelationships(message, identity) }),
            streamSessionResolution: stages.streamSessionResolution({ resolve: (message, identity) => this.resolveSession(message, identity) }),
            moderation: stages.moderation({ authorize: async () => true }),
            commandMatching: stages.commandMatching({ match: (text, context) => this.matchCommand(text, context) }),
            commandAuthorization: stages.commandAuthorization(),
            cooldowns: stages.cooldowns({ runtimeState: store, now }),
            execution: stages.execution({ execute: (context) => this.execute(context) }),
            accounting: stages.accounting({ account: (context) => this.account(context) }),
            audit: stages.audit({ record: async () => {} }),
            responseDelivery: stages.responseDelivery({ deliver: (response, context) => this.deliver(response, context) })
        });
    }

    async start(connections) { if (this.controller) return; this.controller = new AbortController(); for (const connection of connections) { const task = this.runConnection(connection, this.controller.signal).finally(() => this.tasks.delete(task)); this.tasks.add(task); } }
    async stop() { this.controller?.abort(); await Promise.allSettled(this.tasks); this.controller = null; }
    async runConnection(connection, signal) {
        const leaseKey = `connection:youtube:${connection.id}`; let backoff = 1000;
        while (!signal.aborted) {
            try {
                if (!await this.store.acquireLease(leaseKey, this.now())) { await this.wait(5000, signal); continue; }
                await this.runConnectionOnce(connection, signal); backoff = 1000;
            }
            catch (error) { if (!signal.aborted) this.logger.error?.({ error, connectionId: connection.id }, 'chat runtime iteration failed'); await this.wait(error.retryAfterMs || backoff, signal); backoff = Math.min(backoff * 2, 60_000); }
        }
        await this.store.releaseLease(leaseKey);
    }
    async runConnectionOnce(connection, signal) {
        let token = await this.token(connection);
        let broadcasts;
        try { broadcasts = await this.adapter.discoverBroadcasts(token); }
        catch (error) { if (!['TOKEN_EXPIRED', 'TOKEN_REVOKED'].includes(error.code)) throw error; token = await this.token(connection, true); broadcasts = await this.adapter.discoverBroadcasts(token); }
        const live = broadcasts.filter((item) => item.status === 'live');
        if (!live.length) { await this.wait(15_000, signal); return; }
        for (const broadcast of live) {
            if (signal.aborted) return;
            const { liveChatId } = await this.adapter.discoverLiveChat(token, broadcast.id);
            const page = await this.pollOnce({ connection, broadcast, liveChatId, token });
            if (page) await this.wait(page.pollingIntervalMs, signal);
        }
    }
    async pollOnce({ connection, broadcast, liveChatId, token }) {
        const key = `youtube:${connection.id}:${liveChatId}`;
        if (!await this.store.acquireLease(`cursor:${key}`, this.now())) return false;
        const cursor = await this.store.cursor(key);
        let page;
        try { page = await this.adapter.pollChat(token, liveChatId, cursor.pageToken); }
        catch (error) { if (!['TOKEN_EXPIRED', 'TOKEN_REVOKED'].includes(error.code)) throw error; token = await this.token(connection, true); page = await this.adapter.pollChat(token, liveChatId, cursor.pageToken); }
        for (const event of page.events) await this.processEvent({ event, connection, broadcast, liveChatId, token });
        // Cursor advancement is the acknowledgement: it happens only after every
        // event has a durable completed/terminal state.
        await this.store.saveCursor(key, page.nextPageToken, page.pollingIntervalMs, this.now());
        return { ...page, pollingIntervalMs: Math.max(1000, page.pollingIntervalMs) };
    }
    async processEvent({ event, connection, broadcast, liveChatId, token }) {
        const eventKey = `youtube:${event.id}`;
        if (!await this.store.claimEvent(eventKey, this.now())) return { duplicate: true };
        const source = await this.models().Source.query().findOne({ id: connection.sourceId, provider: 'youtube', enabled: true });
        if (!source) { await this.store.completeEvent(eventKey, { type: 'ignored', reason: 'source_unavailable' }, true, this.now()); return { terminal: true }; }
        const message = new ChatMessage({ id: event.id, provider: 'youtube', sourceId: source.channelId, providerUserId: event.providerUserId, text: event.text, occurredAt: event.occurredAt, attributes: { eventKey, liveChatId, broadcastId: broadcast.id, sourceRecordId: source.id, author: event.author, relationships: event.relationships || [], connection, token } });
        try { const context = await this.pipeline.process(message); await this.store.completeEvent(eventKey, context.outcome, false, this.now()); return context; }
        catch (error) { if (!error.retryable) await this.store.completeEvent(eventKey, { type: 'failed', code: error.code || 'RUNTIME_TERMINAL' }, true, this.now()); throw error; }
    }
    models() { return this.server.models(); }
    services() { return this.server.services(); }
    token(connection, refresh = false) { return this.tokenProvider(connection, refresh); }
    resolveIdentity(message) { const author = message.attributes.author || {}; return this.services().chatIdentityService.resolve({ provider: 'youtube', providerUserId: message.providerUserId, handle: author.handle || null, displayName: author.displayName || null, avatarUrl: author.avatarUrl || null, lastSeenAt: message.occurredAt.toISOString() }); }
    async resolveRelationships(message, identity) { const facts = message.attributes.relationships.map((relationship) => ({ relationship, tier: null, expiresAt: null })); await this.services().channelRelationshipService.upsert({ sourceId: message.attributes.sourceRecordId, chatIdentityId: identity.id, observedAt: message.occurredAt.toISOString(), facts }); return this.services().channelRelationshipService.activeFor(message.attributes.sourceRecordId, identity.id, { asOf: message.occurredAt }); }
    async resolveSession(message, identity) { const stream = await this.models().Stream.query().findOne({ sourceId: message.attributes.sourceRecordId, externalId: message.attributes.broadcastId, status: 'live' }).withGraphFetched('streamSession'); if (!stream?.streamSession || stream.streamSession.status !== 'live') throw Object.assign(new Error('No active stream session owns this broadcast.'), { code: 'ACTIVE_SESSION_NOT_FOUND' }); await this.services().participantActivityService.ingest({ idempotencyKey: `${message.provider}:${message.id}:message`, streamerId: stream.streamSession.streamerId, streamSessionId: stream.streamSessionId, chatIdentityId: identity.id, type: 'message', amount: 1, occurredAt: message.occurredAt.toISOString() }); const participant = await this.models().StreamSessionParticipant.query().findOne({ streamSessionId: stream.streamSessionId, chatUserId: identity.chatUserId }); return { streamerId: stream.streamSession.streamerId, streamSessionId: stream.streamSessionId, participantId: participant.id }; }
    async matchCommand(text, context) { const parsed = COMMAND.exec(text.trim()); if (!parsed) return null; const command = await this.models().Command.query().findOne({ streamerId: context.streamerId, name: parsed[1].toLowerCase(), enabled: true }); return command ? { command, argumentText: parsed[2] || '' } : null; }
    async execute(context) { const identity = context.identity; const text = renderCommandTemplate(context.command.responseTemplate, { user: identity.displayName || identity.handle || context.message.providerUserId, username: identity.handle || context.message.providerUserId, args: context.argumentText, command: context.command.name, provider: context.message.provider }); return { response: new ChatResponse({ text, sourceId: context.message.sourceId, replyToMessageId: context.message.id, attributes: { liveChatId: context.message.attributes.liveChatId } }) }; }
    async account(context) { if (context.outcome?.type === 'fulfilled') await this.services().participantActivityService.ingest({ idempotencyKey: `${context.message.provider}:${context.message.id}:command`, streamerId: context.streamerId, streamSessionId: context.streamSessionId, chatIdentityId: context.identity.id, type: 'command', amount: 1, occurredAt: context.message.occurredAt.toISOString() }); return {}; }
    async deliver(response, context) {
        const key = context.message.attributes.eventKey; const prior = await this.store.beginDelivery(key, this.now());
        if (prior.status === 'sent') return prior;
        if (prior.status === 'terminal_failure' || (prior.status === 'sending' && prior.attempts > 1)) { await this.store.finishDelivery(key, 'terminal_failure', { errorCode: 'DELIVERY_AMBIGUOUS' }, this.now()); throw Object.assign(new Error('Delivery state is ambiguous; refusing a duplicate send.'), { code: 'DELIVERY_AMBIGUOUS' }); }
        let token = context.message.attributes.token;
        for (let attempt = 1; attempt <= this.maxSendAttempts; ++attempt) {
            try { const sent = await this.adapter.sendChatMessage(token, response.attributes.liveChatId, response.text); await this.store.finishDelivery(key, 'sent', { providerMessageId: sent.id }, this.now()); return sent; }
            catch (error) { if (['TOKEN_EXPIRED', 'TOKEN_REVOKED'].includes(error.code)) { token = await this.token(context.message.attributes.connection, true); continue; } if (!error.retryable || attempt === this.maxSendAttempts) { const terminal = !error.retryable; if (terminal) await this.store.finishDelivery(key, 'terminal_failure', { errorCode: error.code }, this.now()); throw error; } await this.wait(error.retryAfterMs || Math.min(1000 * (2 ** (attempt - 1)), 10_000)); }
        }
    }
};
