'use strict';

const Assert = require('node:assert/strict');
const Test = require('node:test');
let Knex;
let Model;
let StreamSession;
let StreamSessionState;
let StreamSessionStateService;
try {
    Knex = require('knex');
    ({ Model } = require('objection'));
    StreamSession = require('../lib/models/stream-session');
    StreamSessionState = require('../lib/models/stream-session-state');
    StreamSessionStateService = require('../lib/services/stream-session-state-service');
}
catch {
    // Persistence dependencies may be omitted from lightweight test images.
}
const InProcessRuntimeState = require('../lib/runtime-state/in-process-runtime-state');
const migration = require('../migrations/001-initial-schema');

const setup = async (t, limits) => {
    const knex = Knex({ client: 'better-sqlite3', connection: { filename: ':memory:' }, useNullAsDefault: true });
    await knex.raw('PRAGMA foreign_keys = ON');
    await migration.up(knex);
    Model.knex(knex);
    t.after(async () => {
        Model.knex(null);
        await knex.destroy();
    });
    const [streamerId] = await knex('Streamer').insert({ slug: 'state', displayName: 'State' });
    const [streamSessionId] = await knex('StreamSession').insert({ streamerId, title: 'State test' });
    const service = new StreamSessionStateService({ limits });
    service.server = { models: () => ({ StreamSession, StreamSessionState }) };
    return { knex, service, streamSessionId };
};

Test('persistent state uses versions and compare-and-swap', { skip: !Knex && 'database dependencies unavailable' }, async (t) => {
    const { service, streamSessionId } = await setup(t);
    const access = { component: 'platform' };
    const created = await service.compareAndSwap(streamSessionId, 'platform.poll', 'votes', 0, { yes: 1 }, { access });
    Assert.equal(created.version, 1);
    Assert.deepEqual((await service.get(streamSessionId, 'platform.poll', 'votes', { access })).value, { yes: 1 });
    await Assert.rejects(
        service.compareAndSwap(streamSessionId, 'platform.poll', 'votes', 0, { yes: 2 }, { access }),
        (error) => error.code === 'STATE_CONFLICT'
    );
    const updated = await service.update(streamSessionId, 'platform.poll', 'votes', (value) => ({ yes: value.yes + 1 }), { access });
    Assert.equal(updated.version, 2);
    Assert.deepEqual(updated.value, { yes: 2 });
});

Test('state enforces namespace, value and session quotas', { skip: !Knex && 'database dependencies unavailable' }, async (t) => {
    const { service, streamSessionId } = await setup(t, { maxValueBytes: 20, maxSessionBytes: 25, maxSessionValues: 1 });
    await Assert.rejects(
        service.compareAndSwap(streamSessionId, 'platform.game', 'x', 0, 1),
        (error) => error.code === 'RESERVED_STATE_NAMESPACE'
    );
    const options = { access: { component: 'feature', featureId: 'quiz' } };
    await service.compareAndSwap(streamSessionId, 'feature.quiz.round', 'x', 0, 'small', options);
    await Assert.rejects(
        service.compareAndSwap(streamSessionId, 'feature.quiz.round', 'y', 0, 'small', options),
        (error) => error.code === 'STATE_SESSION_LIMIT'
    );
    await Assert.rejects(
        service.compareAndSwap(streamSessionId, 'feature.quiz.round', 'x', 1, 'x'.repeat(30), options),
        (error) => error.code === 'STATE_VALUE_LIMIT'
    );
});

Test('message content needs a purpose and short expiry; expiry and session cleanup remove rows', { skip: !Knex && 'database dependencies unavailable' }, async (t) => {
    const { knex, service, streamSessionId } = await setup(t);
    const access = { component: 'feature', featureId: 'summary' };
    const base = { access, containsMessageContent: true };
    await Assert.rejects(
        service.compareAndSwap(streamSessionId, 'feature.summary.input', 'extract', 0, 'hello', base),
        (error) => error.code === 'MESSAGE_CONTENT_PURPOSE_REQUIRED'
    );
    const expiresAt = new Date(Date.now() + 1000).toISOString();
    await service.compareAndSwap(streamSessionId, 'feature.summary.input', 'extract', 0, 'hello', {
        ...base, purpose: 'Summarize the active discussion', expiresAt
    });
    Assert.equal((await knex('StreamSessionState').first()).purpose, 'Summarize the active discussion');
    await service.purgeExpired(new Date(Date.now() + 2000));
    Assert.equal(await knex('StreamSessionState').count({ count: '*' }).first().then((row) => Number(row.count)), 0);
    await service.compareAndSwap(streamSessionId, 'feature.summary.output', 'result', 0, { summary: 'safe' }, { access });
    await service.cleanupSession(streamSessionId);
    Assert.equal(await knex('StreamSessionState').count({ count: '*' }).first().then((row) => Number(row.count)), 0);
});

Test('in-process runtime state atomically gates cooldowns and deduplication', () => {
    const runtime = new InProcessRuntimeState();
    Assert.deepEqual(runtime.consumeCooldown('session:1:command:hello', 1000, 100), { allowed: true, retryAfterMs: 0 });
    Assert.deepEqual(runtime.consumeCooldown('session:1:command:hello', 1000, 150), { allowed: false, retryAfterMs: 950 });
    Assert.equal(runtime.rememberOnce('session:1:event:abc', 500, 100), true);
    Assert.equal(runtime.rememberOnce('session:1:event:abc', 500, 200), false);
    Assert.equal(runtime.clearSession(1), 2);
});
