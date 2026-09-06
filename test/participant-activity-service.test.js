'use strict';

const Assert = require('node:assert/strict');
const Test = require('node:test');
const { startServer } = require('./helpers/server');
let databaseAvailable = true;
try {
    require.resolve('@hapi/hapi');
    require.resolve('better-sqlite3');
}
catch {
    databaseAvailable = false;
}

const time = '2026-09-06T12:00:00.000Z';

Test('normalized participant activity is idempotent and isolated by streamer and session', { skip: !databaseAvailable && 'database dependencies unavailable' }, async (t) => {
    const context = await startServer(t);
    const { models, services } = context;
    const chatUser = await models.ChatUser.query().insert({ status: 'active' });
    const identities = await models.ChatIdentity.query().insertGraph([
        { chatUserId: chatUser.id, provider: 'twitch', providerUserId: 'tw-1', lastSeenAt: time },
        { chatUserId: chatUser.id, provider: 'youtube', providerUserId: 'yt-1', lastSeenAt: time }
    ]);
    const streamerA = await models.Streamer.query().insert({ slug: 'scope-a', displayName: 'Scope A' });
    const streamerB = await models.Streamer.query().insert({ slug: 'scope-b', displayName: 'Scope B' });
    const sessionA1 = await models.StreamSession.query().insert({ streamerId: streamerA.id, title: 'A1', status: 'live' });
    const sessionA2 = await models.StreamSession.query().insert({ streamerId: streamerA.id, title: 'A2', status: 'live' });
    const sessionB = await models.StreamSession.query().insert({ streamerId: streamerB.id, title: 'B', status: 'live' });
    const ingest = (changes) => services.participantActivityService.ingest({
        idempotencyKey: changes.key, streamerId: changes.streamerId, streamSessionId: changes.sessionId,
        chatIdentityId: changes.identityId, type: changes.type || 'message', amount: changes.amount || 1,
        occurredAt: changes.occurredAt || time
    });

    for (const [index, type, amount] of [['1', 'message', 1], ['2', 'watchReward', 3], ['3', 'win', 2], ['4', 'command', 1]]) {
        const activity = { key: `provider:event-${index}`, streamerId: streamerA.id, sessionId: sessionA1.id,
            identityId: identities[Number(index) % 2].id, type, amount };
        Assert.equal((await ingest(activity)).applied, true);
        Assert.equal((await ingest(activity)).applied, false);
    }
    await ingest({ key: 'provider:event-5', streamerId: streamerA.id, sessionId: sessionA2.id, identityId: identities[0].id });
    await ingest({ key: 'provider:event-6', streamerId: streamerB.id, sessionId: sessionB.id, identityId: identities[1].id, type: 'win', amount: 2 });

    const durable = await models.StreamerParticipant.query().orderBy('streamerId');
    Assert.deepEqual(durable.map(({ streamerId, chatUserId, messageCount, watchRewardCount, commandCount, winCount }) =>
        ({ streamerId, chatUserId, messageCount, watchRewardCount, commandCount, winCount })), [
        { streamerId: streamerA.id, chatUserId: chatUser.id, messageCount: 2, watchRewardCount: 3, commandCount: 1, winCount: 2 },
        { streamerId: streamerB.id, chatUserId: chatUser.id, messageCount: 0, watchRewardCount: 0, commandCount: 0, winCount: 2 }
    ]);
    const sessions = await models.StreamSessionParticipant.query().orderBy('streamSessionId');
    Assert.deepEqual(sessions.map(({ messageCount, commandCount, winCount }) => ({ messageCount, commandCount, winCount })), [
        { messageCount: 1, commandCount: 1, winCount: 2 }, { messageCount: 1, commandCount: 0, winCount: 0 },
        { messageCount: 0, commandCount: 0, winCount: 2 }
    ]);
    Assert.equal(await models.ParticipantActivityEvent.query().resultSize(), 6);
});

Test('leaderboards break ties deterministically, paginate, and honor exclusions', { skip: !databaseAvailable && 'database dependencies unavailable' }, async (t) => {
    const context = await startServer(t);
    const { models, services } = context;
    const streamer = await models.Streamer.query().insert({ slug: 'leaders', displayName: 'Leaders' });
    const session = await models.StreamSession.query().insert({ streamerId: streamer.id, title: 'Live', status: 'live' });
    const users = [];
    for (let index = 0; index < 4; ++index) {
        const user = await models.ChatUser.query().insert({ status: 'active' });
        const identity = await models.ChatIdentity.query().insert({ chatUserId: user.id, provider: 'test', providerUserId: `u${index}`, lastSeenAt: time });
        users.push({ user, identity });
        await services.participantActivityService.ingest({ idempotencyKey: `message-${index}`, streamerId: streamer.id,
            streamSessionId: session.id, chatIdentityId: identity.id, type: 'message', amount: 5, occurredAt: time });
    }
    await models.StreamerParticipant.query().where({ chatUserId: users[2].user.id }).patch({ privacyExcluded: true });
    await models.StreamSessionParticipant.query().where({ chatUserId: users[3].user.id }).patch({ moderationExcluded: true });

    const first = await services.participantActivityService.leaderboard('session', session.id, 'messageCount', { limit: 1 });
    Assert.deepEqual(first.items.map(({ chatUserId }) => chatUserId), [users[0].user.id]);
    Assert.deepEqual(first.nextCursor, { value: 5, chatUserId: users[0].user.id });
    const second = await services.participantActivityService.leaderboard('session', session.id, 'messageCount', { limit: 1, cursor: first.nextCursor });
    Assert.deepEqual(second.items.map(({ chatUserId }) => chatUserId), [users[1].user.id]);
    Assert.equal(second.nextCursor, null);
});
