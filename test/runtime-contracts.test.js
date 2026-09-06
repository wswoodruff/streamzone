'use strict';

const Assert = require('node:assert/strict');
const Test = require('node:test');
const { ChatMessage, ChatResponse, InteractionContext, InteractionOutcome } = require('../lib/runtime/contracts');
const cooldownKey = require('../lib/runtime/cooldown-key');
const { InteractionPipeline, STAGE_ORDER } = require('../lib/runtime/pipeline');
const stages = require('../lib/runtime/stages');
const InProcessRuntimeState = require('../lib/runtime-state/in-process-runtime-state');

const message = () => new ChatMessage({
    id: 'event-1', provider: 'example', sourceId: 'channel-1', providerUserId: 'viewer-1', text: '!hello world', occurredAt: 100
});

Test('provider-neutral contracts validate their boundaries and expose structured outcomes', () => {
    Assert.equal(message().provider, 'example');
    Assert.throws(() => new ChatMessage({}), /ChatMessage.id/);
    Assert.equal(new ChatResponse({ text: 'Hello!', sourceId: 'channel-1' }).text, 'Hello!');
    const outcome = InteractionOutcome.refunded({ amount: 2 });
    Assert.equal(outcome.type, 'refunded');
    Assert.deepEqual(outcome.details, { amount: 2 });
    Assert.throws(() => new InteractionOutcome('maybe'), /Unknown interaction outcome/);
});

Test('cooldown keys require an explicit supported scope and its identifiers', () => {
    Assert.equal(cooldownKey({ scope: 'global', commandId: 3 }), 'command:3:scope:global');
    Assert.equal(cooldownKey({ scope: 'streamer', commandId: 3, streamerId: 4 }), 'command:3:scope:streamer:streamer:4');
    Assert.equal(cooldownKey({ scope: 'session', commandId: 3, streamSessionId: 5 }), 'command:3:scope:session:session:5');
    Assert.equal(cooldownKey({ scope: 'participant', commandId: 3, streamSessionId: 5, participantId: 6 }), 'command:3:scope:participant:session:5:participant:6');
    Assert.throws(() => cooldownKey({ commandId: 3 }), /explicitly/);
    Assert.throws(() => cooldownKey({ scope: 'participant', commandId: 3 }), /session/);
});

const stageSet = (overrides = {}) => Object.fromEntries(STAGE_ORDER.map((name) => [name, overrides[name] || (async () => {})]));

Test('pipeline has a fixed middleware order and passes only normalized context', async () => {
    const visited = [];
    const pipeline = new InteractionPipeline(stageSet(Object.fromEntries(STAGE_ORDER.map((name) => [name, async () => visited.push(name)]))));
    const context = await pipeline.process(message());
    Assert.deepEqual(visited, STAGE_ORDER);
    Assert.equal(context.outcome.type, 'ignored');
    Assert.throws(() => new InteractionPipeline({}), /missing/);
});

Test('stages compose using injected functions without provider SDKs', async () => {
    const runtimeState = new InProcessRuntimeState();
    const calls = [];
    const pipeline = new InteractionPipeline({
        deduplication: stages.deduplication({ runtimeState }),
        identityResolution: stages.identityResolution({ resolve: async () => ({ id: 8 }) }),
        relationshipRefresh: stages.relationshipRefresh({ refresh: async () => ({ moderator: false }) }),
        streamSessionResolution: stages.streamSessionResolution({ resolve: async () => ({ streamerId: 4, streamSessionId: 5, participantId: 6 }) }),
        moderation: stages.moderation({ authorize: async () => true }),
        commandMatching: stages.commandMatching({ match: async () => ({ command: { id: 3, cooldownSeconds: 2, cooldownScope: 'participant' }, arguments: ['world'] }) }),
        cooldowns: stages.cooldowns({ runtimeState, now: () => 100 }),
        execution: stages.execution({ execute: async (context) => ({ response: new ChatResponse({ text: `Hello ${context.arguments[0]}`, sourceId: context.message.sourceId }) }) }),
        accounting: stages.accounting({ account: async () => ({}) }),
        audit: stages.audit({ record: async (context) => calls.push(`audit:${context.outcome.type}`) }),
        responseDelivery: stages.responseDelivery({ deliver: async (response) => calls.push(`send:${response.text}`) })
    });
    const result = await pipeline.process(message());
    Assert.equal(result.outcome.type, 'fulfilled');
    Assert.deepEqual(calls, ['audit:fulfilled', 'send:Hello world']);
    Assert.equal((await pipeline.process(message())).outcome.type, 'ignored');
});

Test('policy, execution, and accounting stages produce terminal outcome variants', async () => {
    const context = new InteractionContext(message(), { outcome: InteractionOutcome.accepted(), command: { id: 1 } });
    await stages.execution({ execute: async () => { throw Object.assign(new Error('no'), { code: 'BROKEN' }); } })(context);
    Assert.equal(context.outcome.type, 'failed');
    await stages.accounting({ account: async () => ({ refunded: true, amount: 10, reason: 'failed' }) })(context);
    Assert.equal(context.outcome.type, 'refunded');
    await stages.accounting({ account: async () => ({ insufficient: true, required: 10, available: 2 }) })(context);
    Assert.equal(context.outcome.type, 'insufficient_points');
});
