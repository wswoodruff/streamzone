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
    const createStreamingTables = require('../migrations/001-create-streaming-tables');
    const createAuthTables = require('../migrations/002-create-auth-tables');
    const createCommandTables = require('../migrations/003-create-command-tables');
    const renameModelTables = require('../migrations/004-rename-model-tables');
    const createStreamerMemberships = require('../migrations/005-create-streamer-memberships');
    const Streamer = require('../lib/models/streamer');
    const User = require('../lib/models/user');

    const expectedTables = ['Command', 'Session', 'Source', 'Stream', 'Streamer', 'StreamerMembership', 'User'];

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

    const migrateLowercaseSchema = async (knex) => {
        await createStreamingTables.up(knex);
        await createAuthTables.up(knex);
        await createCommandTables.up(knex);
    };

    Test('forward migrations rename a populated lowercase schema and preserve its constraints and relations', async (t) => {
        const knex = await makeDatabase();
        t.after(async () => {
            Model.knex(null);
            await knex.destroy();
        });

        await migrateLowercaseSchema(knex);
        const [streamerId] = await knex('streamers').insert({ slug: 'alice', displayName: 'Alice' });
        const [sourceId] = await knex('sources').insert({ streamerId, provider: 'twitch', channelId: 'alice-channel' });
        await knex('streams').insert({ sourceId, externalId: 'live-1', title: 'Live now' });
        await knex('commands').insert({ streamerId, name: 'hello', responseTemplate: 'Hello!' });
        const [userId] = await knex('users').insert({ email: 'alice@example.com', displayName: 'Alice', passwordHash: 'hash' });
        await knex('sessions').insert({ id: 'a'.repeat(64), userId, expiresAt: new Date(Date.now() + 60_000).toISOString() });

        await renameModelTables.up(knex);
        await createStreamerMemberships.up(knex);
        await knex('StreamerMembership').insert({ userId, streamerId, role: 'owner' });

        Assert.deepEqual(await tableNames(knex), expectedTables);
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

    Test('down migrations restore the lowercase schema with working foreign keys', async (t) => {
        const knex = await makeDatabase();
        t.after(() => knex.destroy());
        await migrateLowercaseSchema(knex);
        await renameModelTables.up(knex);
        await createStreamerMemberships.up(knex);

        await createStreamerMemberships.down(knex);
        await renameModelTables.down(knex);

        Assert.deepEqual(await tableNames(knex), ['commands', 'sessions', 'sources', 'streamers', 'streams', 'users']);
        Assert.deepEqual(await foreignKeys(knex, 'sessions'), [
            { from: 'userId', referencedTable: 'users', onDelete: 'CASCADE' }
        ]);
        Assert.deepEqual(await foreignKeys(knex, 'streams'), [
            { from: 'sourceId', referencedTable: 'sources', onDelete: 'CASCADE' }
        ]);
        Assert.deepEqual(await knex.raw('PRAGMA foreign_key_check'), []);
    });
}
