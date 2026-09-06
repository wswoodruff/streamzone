'use strict';

const Assert = require('node:assert/strict');
const Test = require('node:test');
let Knex;
let Model;
try {
    Knex = require('knex');
    ({ Model } = require('objection'));
}
catch {
    // Database dependencies may be unavailable in stripped-down test environments.
}

if (!Knex) {
    Test('canonical schema assertions (database dependencies unavailable)', { skip: true }, () => {});
}
else {
    const migration = require('../migrations/001-initial-schema');
    const { CHAT_ROLES } = require('../lib/runtime/chat-roles');
    const Streamer = require('../lib/models/streamer');
    const User = require('../lib/models/user');

    const expectedTables = [
        'AiFeatureConfiguration', 'AiInvocation', 'ChannelRelationship', 'ChatIdentity', 'ChatUser',
        'Command', 'EarningPolicy', 'ParticipantActivityEvent', 'PointAccount', 'PointLedgerEntry',
        'PointReservationSettlement', 'RewardDefinition', 'RewardExecutorConfiguration', 'RewardRedemption',
        'Session', 'Source', 'Stream', 'StreamSession', 'StreamSessionParticipant', 'StreamSessionState',
        'Streamer', 'StreamerInstructionVersion', 'StreamerInvitation', 'StreamerMembership',
        'StreamerParticipant', 'User'
    ].sort();

    const makeDatabase = async () => {
        const knex = Knex({ client: 'better-sqlite3', connection: { filename: ':memory:' }, useNullAsDefault: true });
        await knex.raw('PRAGMA foreign_keys = ON');
        return knex;
    };

    const tableNames = async (knex) => (await knex('sqlite_master')
        .select('name')
        .where({ type: 'table' })
        .whereNot('name', 'like', 'sqlite_%'))
        .map(({ name }) => name)
        .sort();

    Test('one canonical migration builds the complete greenfield schema', async (t) => {
        const knex = await makeDatabase();
        t.after(() => knex.destroy());
        await migration.up(knex);
        Assert.deepEqual(await tableNames(knex), expectedTables);
        Assert.equal(await knex.schema.hasTable('AiRewardExecution'), false);
        Assert.deepEqual(await knex.raw('PRAGMA foreign_key_check'), []);
    });

    Test('greenfield constraints reject obsolete and invalid domain states', async (t) => {
        const knex = await makeDatabase();
        t.after(() => knex.destroy());
        await migration.up(knex);

        const [streamerId] = await knex('Streamer').insert({ slug: 'alice', displayName: 'Alice' });
        const [sourceId] = await knex('Source').insert({ streamerId, provider: 'twitch', channelId: 'alice-channel' });
        const [sessionId] = await knex('StreamSession').insert({ streamerId, title: 'Weekly show' });

        const streamInfo = await knex.raw('PRAGMA table_info(`Stream`)');
        Assert.equal(streamInfo.find(({ name }) => name === 'streamSessionId').notnull, 1);
        const streamFks = await knex.raw('PRAGMA foreign_key_list(`Stream`)');
        Assert.ok(streamFks.some((fk) => fk.from === 'streamSessionId' && fk.table === 'StreamSession' && fk.on_delete === 'CASCADE'));
        await Assert.rejects(knex('Stream').insert({ sourceId, externalId: 'ungrouped' }), /NOT NULL constraint failed/);
        await knex('Stream').insert({ sourceId, streamSessionId: sessionId, externalId: 'grouped' });
        await Assert.rejects(knex('Stream').insert({ sourceId, streamSessionId: sessionId, externalId: 'same-session-source' }), /UNIQUE constraint failed/);

        for (const [index, role] of CHAT_ROLES.entries()) {
            await knex('Command').insert({ streamerId, name: `role-${index}`, responseTemplate: 'ok', requiredChatRole: role });
        }
        await knex('Command').insert({ streamerId, name: 'default-role', responseTemplate: 'ok' });
        Assert.equal((await knex('Command').where({ name: 'default-role' }).first()).requiredChatRole, 'everyone');
        await Assert.rejects(knex('Command').insert({ streamerId, name: 'bad-role', responseTemplate: 'no', requiredChatRole: 'admin' }), /CHECK constraint failed/);
        await Assert.rejects(knex('Command').insert({ streamerId, name: 'bad-scope', responseTemplate: 'no', cooldownScope: 'legacy' }), /CHECK constraint failed/);

        await knex('RewardDefinition').insert({ streamerId, name: 'Manual', pointCost: 10, fulfillmentType: 'manual', eligibilityPolicy: '{}' });
        await knex('RewardDefinition').insert({ streamerId, name: 'Bot', pointCost: 10, fulfillmentType: 'deterministicBot', eligibilityPolicy: '{}' });
        await Assert.rejects(knex('RewardDefinition').insert({ streamerId, name: 'AI reward', pointCost: 10, fulfillmentType: 'ai', eligibilityPolicy: '{}' }), /CHECK constraint failed/);

        const aiColumns = (await knex.raw('PRAGMA table_info(`AiFeatureConfiguration`)')).map(({ name }) => name);
        Assert.ok(aiColumns.includes('streamerId'));
        Assert.equal(aiColumns.includes('rewardDefinitionId'), false);
        const aiFks = await knex.raw('PRAGMA foreign_key_list(`AiInvocation`)');
        for (const target of ['Streamer', 'StreamSession', 'ChatUser', 'ChatIdentity', 'StreamerInstructionVersion', 'PointLedgerEntry']) {
            Assert.ok(aiFks.some((fk) => fk.table === target), `AiInvocation -> ${target}`);
        }

        const [chatUserId] = await knex('ChatUser').insert({ status: 'active' });
        const [accountId] = await knex('PointAccount').insert({ streamerId, chatUserId });
        await Assert.rejects(knex('PointAccount').where({ id: accountId }).update({ availableBalance: -1 }), /CHECK constraint failed/);
        await Assert.rejects(knex('PointLedgerEntry').insert({ accountId, delta: 1, type: 'spend', reason: 'invalid sign', actorType: 'system', actorId: 'test', idempotencyKey: 'bad-sign' }), /CHECK constraint failed/);

        await knex('StreamerInstructionVersion').insert({ streamerId, instruction: 'One', status: 'active' });
        await Assert.rejects(knex('StreamerInstructionVersion').insert({ streamerId, instruction: 'Two', status: 'active' }), /UNIQUE constraint failed/);
        Assert.deepEqual(await knex.raw('PRAGMA foreign_key_check'), []);
    });

    Test('model relationships resolve against the canonical schema and cascades are clean', async (t) => {
        const knex = await makeDatabase();
        t.after(async () => {
            Model.knex(null);
            await knex.destroy();
        });
        await migration.up(knex);
        const [streamerId] = await knex('Streamer').insert({ slug: 'graphs', displayName: 'Graphs' });
        const [sourceId] = await knex('Source').insert({ streamerId, provider: 'youtube', channelId: 'graphs-channel' });
        const [sessionId] = await knex('StreamSession').insert({ streamerId, title: 'Graph session' });
        await knex('Stream').insert({ sourceId, streamSessionId: sessionId, externalId: 'video-1', title: 'Live now' });
        await knex('Command').insert({ streamerId, name: 'hello', responseTemplate: 'Hello!' });
        const [userId] = await knex('User').insert({ email: 'graphs@example.com', displayName: 'Graphs', passwordHash: 'hash' });
        await knex('Session').insert({ id: 'a'.repeat(64), userId, expiresAt: new Date(Date.now() + 60_000).toISOString() });
        await knex('StreamerMembership').insert({ userId, streamerId, role: 'owner' });

        Model.knex(knex);
        const streamer = await Streamer.query().findById(streamerId).withGraphFetched('[sources.streams.streamSession, streamSessions, commands, memberships.user]');
        Assert.equal(streamer.sources[0].streams[0].streamSession.id, sessionId);
        Assert.equal(streamer.streamSessions[0].id, sessionId);
        Assert.equal(streamer.commands[0].requiredChatRole, 'everyone');
        const user = await User.query().findById(userId).withGraphFetched('memberships.streamer');
        Assert.equal(user.memberships[0].streamer.slug, 'graphs');

        await knex('User').where({ id: userId }).delete();
        Assert.equal(Number((await knex('Session').count({ count: '*' }).first()).count), 0);
        await knex('Streamer').where({ id: streamerId }).delete();
        for (const table of ['Source', 'StreamSession', 'Stream', 'Command']) {
            Assert.equal(Number((await knex(table).count({ count: '*' }).first()).count), 0, table);
        }
        Assert.deepEqual(await knex.raw('PRAGMA foreign_key_check'), []);
    });

    Test('down removes the canonical schema cleanly', async (t) => {
        const knex = await makeDatabase();
        t.after(() => knex.destroy());
        await migration.up(knex);
        await migration.down(knex);
        Assert.deepEqual(await tableNames(knex), []);
    });
}
