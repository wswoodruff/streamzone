'use strict';

const Assert = require('node:assert/strict');
const Fs = require('node:fs');
const Os = require('node:os');
const Path = require('node:path');
const Test = require('node:test');
let Knex;
let Model;
let ChatIdentity;
let ChatUser;
let User;
let ChatIdentityService;
try {
    Knex = require('knex');
    ({ Model } = require('objection'));
    ChatIdentity = require('../lib/models/chat-identity');
    ChatUser = require('../lib/models/chat-user');
    User = require('../lib/models/user');
    ChatIdentityService = require('../lib/services/chat-identity-service');
}
catch {
    // Production database dependencies are optional in stripped-down test environments.
}

const migrations = [
    require('../migrations/001-create-streaming-tables'),
    require('../migrations/002-create-auth-tables'),
    require('../migrations/003-create-command-tables'),
    require('../migrations/004-create-streamer-memberships'),
    require('../migrations/005-create-streamer-invitations'),
    require('../migrations/006-create-chat-identities')
];

const author = (changes = {}) => ({
    provider: 'twitch', providerUserId: 'immutable-123', handle: 'first_name',
    displayName: 'First Name', avatarUrl: 'https://example.com/avatar.png',
    lastSeenAt: '2026-09-06T10:00:00.000Z', ...changes
});

Test('normalized author validation excludes provider payloads', { skip: !Knex && 'database dependencies unavailable' }, async () => {
    await Assert.rejects(ChatIdentityService.authorSchema.validateAsync(author({ payload: { secret: true } })));
    await Assert.rejects(ChatIdentityService.authorSchema.validateAsync(author({ providerUserId: ' ' })));
    const value = await ChatIdentityService.authorSchema.validateAsync(author({ provider: ' Twitch ' }));
    Assert.equal(value.provider, 'twitch');
});

Test('identity resolution handles first, repeat, rename, relations, and concurrent sightings', { skip: !Knex && 'database dependencies unavailable' }, async (t) => {
    const directory = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'streamzone-chat-'));
    const knex = Knex({
        client: 'better-sqlite3', connection: { filename: Path.join(directory, 'test.sqlite') },
        useNullAsDefault: true, pool: { min: 1, max: 4 }
    });
    t.after(async () => { Model.knex(null); await knex.destroy(); Fs.rmSync(directory, { recursive: true, force: true }); });
    await knex.raw('PRAGMA journal_mode = WAL');
    await knex.raw('PRAGMA foreign_keys = ON');
    for (const migration of migrations) await migration.up(knex);
    Model.knex(knex);

    const service = new ChatIdentityService();
    service.server = { models: () => ({ ChatIdentity, ChatUser, User }) };

    const first = await service.resolve(author());
    const repeat = await service.resolve(author({ lastSeenAt: '2026-09-06T10:01:00.000Z' }));
    Assert.equal(repeat.id, first.id);
    Assert.equal(repeat.chatUserId, first.chatUserId);
    Assert.equal(new Date(repeat.lastSeenAt).toISOString(), '2026-09-06T10:01:00.000Z');

    const renamed = await service.resolve(author({ handle: 'new_name', displayName: 'New Name' }));
    Assert.equal(renamed.handle, 'new_name');
    Assert.equal(renamed.providerUserId, 'immutable-123');

    const user = await User.query().insert({ email: 'claimed@example.com', displayName: 'Claimed', passwordHash: 'hash' });
    await ChatUser.query().patchAndFetchById(first.chatUserId, { userId: user.id });
    const claimed = await User.query().findById(user.id).withGraphFetched('claimedChatUsers.identities');
    Assert.equal(claimed.claimedChatUsers[0].identities[0].id, first.id);

    const concurrentAuthor = author({ providerUserId: 'simultaneous-456' });
    const results = await Promise.all(Array.from({ length: 8 }, () => service.resolve(concurrentAuthor)));
    Assert.equal(new Set(results.map(({ id }) => id)).size, 1);
    Assert.equal(await ChatIdentity.query().where({ provider: 'twitch', providerUserId: 'simultaneous-456' }).resultSize(), 1);
    Assert.equal(await ChatUser.query().resultSize(), 2);
});
