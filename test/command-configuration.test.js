'use strict';

const Assert = require('node:assert/strict');
const Test = require('node:test');

let dependenciesAvailable = true;
try {
    require.resolve('@hapi/joi');
    require.resolve('better-sqlite3');
    require.resolve('knex');
}
catch {
    dependenciesAvailable = false;
}

if (!dependenciesAvailable) {
    Test('command chat-role configuration assertions (database dependencies unavailable)', { skip: true }, () => {});
}
else {
    const Knex = require('knex');
    const { payload, patchPayload } = require('../lib/validation/commands');
    const createStreamingTables = require('../migrations/001-create-streaming-tables');
    const createCommandTables = require('../migrations/003-create-command-tables');
    const addCooldownScope = require('../migrations/013-add-command-cooldown-scope');
    const addCommandChatRole = require('../migrations/019-add-command-chat-role');
    const expandCommandChatRole = require('../migrations/020-expand-command-chat-role');
    const migrations = [createStreamingTables, createCommandTables, addCooldownScope, addCommandChatRole, expandCommandChatRole];

    const makeDatabase = async () => {
        const knex = Knex({ client: 'better-sqlite3', connection: { filename: ':memory:' }, useNullAsDefault: true });
        await knex.raw('PRAGMA foreign_keys = ON');
        return knex;
    };

    Test('command validation accepts moderator, supermod, and owner access levels', () => {
        for (const requiredChatRole of ['everyone', 'moderator', 'supermod', 'owner']) {
            const result = payload.validate({ name: 'hello', responseTemplate: 'Hello!', requiredChatRole });
            Assert.equal(result.error, undefined, requiredChatRole);
        }
        Assert.match(patchPayload.validate({ requiredChatRole: 'admin' }).error.message, /requiredChatRole/);
    });

    Test('command chat-role migration defaults behavior to everyone and persists owner access', async (t) => {
        const knex = await makeDatabase();
        t.after(() => knex.destroy());
        for (const migration of migrations) await migration.up(knex);

        const [streamerId] = await knex('Streamer').insert({ slug: 'alice', displayName: 'Alice' });
        await knex('Command').insert({ streamerId, name: 'hello', responseTemplate: 'Hello!' });
        Assert.equal((await knex('Command').first()).requiredChatRole, 'everyone');

        await knex('Command').insert({ streamerId, name: 'owner-only', responseTemplate: 'Owner!', requiredChatRole: 'owner' });
        Assert.equal((await knex('Command').where({ name: 'owner-only' }).first()).requiredChatRole, 'owner');
    });

    Test('owner access migration upgrades the previous enum-constrained command column', async (t) => {
        const knex = await makeDatabase();
        t.after(() => knex.destroy());
        for (const migration of [createStreamingTables, createCommandTables, addCooldownScope]) await migration.up(knex);
        await knex.schema.alterTable('Command', (table) => {
            table.enum('requiredChatRole', ['everyone', 'moderator', 'supermod']).notNullable().defaultTo('everyone');
        });

        const [streamerId] = await knex('Streamer').insert({ slug: 'legacy', displayName: 'Legacy' });
        await Assert.rejects(
            knex('Command').insert({ streamerId, name: 'owner-only', responseTemplate: 'Owner!', requiredChatRole: 'owner' }),
            /constraint|check/i
        );

        await expandCommandChatRole.up(knex);
        await knex('Command').insert({ streamerId, name: 'owner-only', responseTemplate: 'Owner!', requiredChatRole: 'owner' });
        Assert.equal((await knex('Command').where({ name: 'owner-only' }).first()).requiredChatRole, 'owner');
        await Assert.rejects(
            knex('Command').insert({ streamerId, name: 'owner-only', responseTemplate: 'Duplicate' }),
            /UNIQUE constraint failed/
        );
        Assert.deepEqual(await knex.raw('PRAGMA foreign_key_check'), []);
    });
}
