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
    // The production dependencies are optional in stripped-down test environments.
}

if (!Knex) {
    Test('schema migration assertions (database dependencies unavailable)', { skip: true }, () => {});
}
else {
    const migrations = [
        require('../migrations/001-create-streaming-tables'),
        require('../migrations/002-create-auth-tables'),
        require('../migrations/003-create-command-tables'),
        require('../migrations/004-create-streamer-memberships'),
        require('../migrations/005-create-streamer-invitations'),
        require('../migrations/006-create-chat-identities'),
        require('../migrations/007-create-channel-relationships')
    ];
    const Streamer = require('../lib/models/streamer');
    const User = require('../lib/models/user');

    const expectedTables = ['ChannelRelationship', 'ChatIdentity', 'ChatUser', 'Command', 'Session', 'Source', 'Stream', 'Streamer', 'StreamerInvitation', 'StreamerMembership', 'User'];

    const makeDatabase = async () => {
        const knex = Knex({
            client: 'better-sqlite3',
            connection: { filename: ':memory:' },
            useNullAsDefault: true
        });

        await knex.raw('PRAGMA foreign_keys = ON');
        return knex;
    };

    const tableNames = async (knex) => (await knex('sqlite_master')
        .select('name')
        .where({ type: 'table' })
        .whereNotLike('name', 'sqlite_%'))
        .map(({ name }) => name)
        .sort();

    const foreignKeys = async (knex, table) => (await knex.raw(`PRAGMA foreign_key_list(\`${table}\`)`))
        .map(({ from, table: referencedTable, on_delete: onDelete }) => ({ from, referencedTable, onDelete }));

    Test('migrations build a valid fresh PascalCase schema', async (t) => {
        const knex = await makeDatabase();
        t.after(() => knex.destroy());

        for (const migration of migrations) await migration.up(knex);

        Assert.deepEqual(await tableNames(knex), expectedTables);
        Assert.deepEqual(await knex.raw('PRAGMA foreign_key_check'), []);
        for (const table of expectedTables) Assert.equal(await knex.schema.hasTable(table), true);
    });

    Test('fresh schema preserves constraints and model relations', async (t) => {
        const knex = await makeDatabase();
        t.after(async () => {
            Model.knex(null);
            await knex.destroy();
        });

        for (const migration of migrations) await migration.up(knex);
        const [streamerId] = await knex('Streamer').insert({ slug: 'alice', displayName: 'Alice' });
        const [sourceId] = await knex('Source').insert({ streamerId, provider: 'twitch', channelId: 'alice-channel' });
        await knex('Stream').insert({ sourceId, externalId: 'live-1', title: 'Live now' });
        await knex('Command').insert({ streamerId, name: 'hello', responseTemplate: 'Hello!' });
        const [userId] = await knex('User').insert({ email: 'alice@example.com', displayName: 'Alice', passwordHash: 'hash' });
        await knex('Session').insert({ id: 'a'.repeat(64), userId, expiresAt: new Date(Date.now() + 60_000).toISOString() });
        await knex('StreamerMembership').insert({ userId, streamerId, role: 'owner' });

        Assert.deepEqual(await foreignKeys(knex, 'Session'), [
            { from: 'userId', referencedTable: 'User', onDelete: 'CASCADE' }
        ]);
        Assert.deepEqual(await foreignKeys(knex, 'Source'), [
            { from: 'streamerId', referencedTable: 'Streamer', onDelete: 'CASCADE' }
        ]);
        Assert.deepEqual(await foreignKeys(knex, 'Stream'), [
            { from: 'sourceId', referencedTable: 'Source', onDelete: 'CASCADE' }
        ]);
        Assert.deepEqual((await foreignKeys(knex, 'StreamerMembership')).sort((a, b) => a.from.localeCompare(b.from)), [
            { from: 'streamerId', referencedTable: 'Streamer', onDelete: 'CASCADE' },
            { from: 'userId', referencedTable: 'User', onDelete: 'CASCADE' }
        ]);
        Assert.deepEqual(await foreignKeys(knex, 'ChatIdentity'), [
            { from: 'chatUserId', referencedTable: 'ChatUser', onDelete: 'CASCADE' }
        ]);

        await Assert.rejects(
            knex('StreamerMembership').insert({ userId, streamerId, role: 'viewer' }),
            /UNIQUE constraint failed/
        );
        await Assert.rejects(
            knex('Source').insert({ streamerId, provider: 'twitch', channelId: 'alice-channel' }),
            /UNIQUE constraint failed/
        );

        Model.knex(knex);
        const streamer = await Streamer.query().findById(streamerId).withGraphFetched('[sources.streams, commands, memberships.user]');
        Assert.equal(streamer.sources[0].streams[0].externalId, 'live-1');
        Assert.equal(streamer.commands[0].name, 'hello');
        Assert.equal(streamer.memberships[0].user.email, 'alice@example.com');
        const user = await User.query().findById(userId).withGraphFetched('memberships.streamer');
        Assert.equal(user.memberships[0].streamer.slug, 'alice');

        await knex('User').where({ id: userId }).delete();
        Assert.equal(await knex('Session').count({ count: '*' }).first().then(({ count }) => Number(count)), 0);
        Assert.equal(await knex('StreamerMembership').count({ count: '*' }).first().then(({ count }) => Number(count)), 0);
        await knex('Streamer').where({ id: streamerId }).delete();
        Assert.equal(await knex('Source').count({ count: '*' }).first().then(({ count }) => Number(count)), 0);
        Assert.equal(await knex('Stream').count({ count: '*' }).first().then(({ count }) => Number(count)), 0);
        Assert.equal(await knex('Command').count({ count: '*' }).first().then(({ count }) => Number(count)), 0);
    });

    Test('down migrations remove the fresh schema cleanly', async (t) => {
        const knex = await makeDatabase();
        t.after(() => knex.destroy());
        for (const migration of migrations) await migration.up(knex);
        for (const migration of migrations.toReversed()) await migration.down(knex);

        Assert.deepEqual(await tableNames(knex), []);
        Assert.deepEqual(await knex.raw('PRAGMA foreign_key_check'), []);
    });
}
