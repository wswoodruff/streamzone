'use strict';

const Assert = require('node:assert/strict');
const Test = require('node:test');
const { startServer } = require('./helpers/server');

let databaseAvailable = true;
try { require.resolve('better-sqlite3'); }
catch { databaseAvailable = false; }

const now = '2026-09-06T12:00:00.000Z';
const actor = { type: 'system', id: 'economy-test' };
let fixtureSequence = 0;

const fixture = async (t) => {
    const context = await startServer(t);
    fixtureSequence += 1;
    const streamer = await context.models.Streamer.query().insert({ slug: `points-${fixtureSequence}`, displayName: 'Points' });
    const user = await context.models.ChatUser.query().insert({ status: 'active' });
    const session = await context.models.StreamSession.query().insert({ streamerId: streamer.id, title: 'Live', status: 'live' });
    const base = { streamerId: streamer.id, chatUserId: user.id, actor, occurredAt: now };
    return { ...context, streamer, user, session, base, economy: context.services.pointEconomyService };
};

Test('awards are idempotent and concurrent duplicate events create one ledger entry', { skip: !databaseAvailable }, async (t) => {
    const { economy, base, models } = await fixture(t);
    const award = { ...base, amount: 50, reason: 'initial award', idempotencyKey: 'award-once' };
    const results = await Promise.all([economy.award(award), economy.award(award)]);
    Assert.equal(results.filter(({ applied }) => applied).length, 1);
    const account = await models.PointAccount.query().first();
    Assert.equal(account.availableBalance, 50);
    Assert.equal(account.lifetimeEarned, 50);
    Assert.equal(await models.PointLedgerEntry.query().resultSize(), 1);
});

Test('spending and reservations reject insufficient funds and database constraints reject negative balances', { skip: !databaseAvailable }, async (t) => {
    const { economy, base, models, knex } = await fixture(t);
    await economy.award({ ...base, amount: 20, reason: 'earned', idempotencyKey: 'funds' });
    await Assert.rejects(economy.spend({ ...base, amount: 21, reason: 'redemption', idempotencyKey: 'too-much' }), /Insufficient/);
    await economy.reserve({ ...base, amount: 8, reason: 'reserve redemption', idempotencyKey: 'reserve', relatedExecutionId: 'red-1' });
    Assert.equal((await models.PointAccount.query().first()).availableBalance, 12);
    await Assert.rejects(knex('PointAccount').where({ id: 1 }).update({ availableBalance: -1 }), /CHECK constraint failed/);
    Assert.equal(await models.PointLedgerEntry.query().where({ idempotencyKey: 'too-much' }).resultSize(), 0);
});

Test('concurrent debits cannot overdraw an account', { skip: !databaseAvailable }, async (t) => {
    const { economy, base, models } = await fixture(t);
    await economy.award({ ...base, amount: 10, reason: 'earned', idempotencyKey: 'concurrent-funds' });
    const settled = await Promise.allSettled([
        economy.spend({ ...base, amount: 7, reason: 'first redemption', idempotencyKey: 'concurrent-spend-1' }),
        economy.spend({ ...base, amount: 7, reason: 'second redemption', idempotencyKey: 'concurrent-spend-2' })
    ]);
    Assert.equal(settled.filter(({ status }) => status === 'fulfilled').length, 1);
    Assert.equal(settled.filter(({ status }) => status === 'rejected').length, 1);
    Assert.equal((await models.PointAccount.query().first()).availableBalance, 3);
});

Test('refunds are bounded by their related debit and are idempotent', { skip: !databaseAvailable }, async (t) => {
    const { economy, base, models } = await fixture(t);
    await economy.award({ ...base, amount: 20, reason: 'earned', idempotencyKey: 'refund-funds' });
    await economy.spend({ ...base, amount: 10, reason: 'redeem', idempotencyKey: 'redeem', relatedExecutionId: 'execution-1' });
    const refund = { ...base, amount: 10, reason: 'failed execution', idempotencyKey: 'refund', relatedExecutionId: 'execution-1' };
    Assert.equal((await economy.refund(refund)).applied, true);
    Assert.equal((await economy.refund(refund)).applied, false);
    await Assert.rejects(economy.refund({ ...refund, amount: 1, idempotencyKey: 'excess-refund' }), /exceeds/);
    const account = await models.PointAccount.query().first();
    Assert.deepEqual({ balance: account.availableBalance, earned: account.lifetimeEarned, spent: account.lifetimeSpent }, { balance: 20, earned: 20, spent: 10 });
});

Test('earning policies cap idempotent participation intervals per session and UTC day', { skip: !databaseAvailable }, async (t) => {
    const { economy, streamer, user, session, models } = await fixture(t);
    const policy = await models.EarningPolicy.query().insert({ streamerId: streamer.id, eventType: 'participationInterval', name: 'active five minutes', points: 4, perSessionCap: 10, perDayCap: 9 });
    const earn = (key, occurredAt = now) => economy.applyEarningPolicy({ policyId: policy.id, chatUserId: user.id, streamSessionId: session.id, idempotencyKey: key, actor, occurredAt });
    Assert.equal((await earn('interval-1')).awarded, 4);
    Assert.equal((await earn('interval-1')).applied, false);
    Assert.equal((await earn('interval-2')).awarded, 4);
    const capped = await earn('interval-3');
    Assert.deepEqual({ awarded: capped.awarded, capped: capped.capped }, { awarded: 1, capped: true });
    Assert.equal((await earn('interval-4')).awarded, 0);
    Assert.equal((await models.PointAccount.query().first()).availableBalance, 9);
});

Test('reconciliation detects and rebuilds a corrupted cache from immutable ledger entries', { skip: !databaseAvailable }, async (t) => {
    const { economy, base, models, knex } = await fixture(t);
    await economy.award({ ...base, amount: 30, reason: 'earned', idempotencyKey: 'reconcile-award' });
    await economy.spend({ ...base, amount: 7, reason: 'spent', idempotencyKey: 'reconcile-spend' });
    const account = await models.PointAccount.query().first();
    await knex('PointAccount').where({ id: account.id }).update({ availableBalance: 1, lifetimeEarned: 1, lifetimeSpent: 1 });
    const verification = await economy.reconcile(account.id);
    Assert.equal(verification.consistent, false);
    Assert.deepEqual(verification.expected, { availableBalance: 23, lifetimeEarned: 30, lifetimeSpent: 7 });
    Assert.equal((await economy.reconcile(account.id, { rebuild: true })).rebuilt, true);
    Assert.equal((await economy.reconcile(account.id)).consistent, true);
});

Test('only privileged actors can adjust and raw invalid ledger signs are constrained', { skip: !databaseAvailable }, async (t) => {
    const { economy, base, knex } = await fixture(t);
    await Assert.rejects(economy.adjust({ ...base, actor: { type: 'user', id: 'viewer' }, amount: 1, direction: 'credit', reason: 'self grant', idempotencyKey: 'self' }), /require a system or moderator/);
    await Assert.rejects(knex('PointLedgerEntry').insert({ accountId: 1, delta: -1, type: 'award', reason: 'invalid', actorType: 'system', actorId: 'bad', idempotencyKey: 'bad' }), /CHECK constraint failed/);
});
