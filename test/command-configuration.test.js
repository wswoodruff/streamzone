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
    const migrations = [
        require('../migrations/001-create-streaming-tables'),
        require('../migrations/003-create-command-tables'),
        require('../migrations/013-add-command-cooldown-scope'),
        require('../migrations/019-add-command-chat-role')
    ];

    Test('command validation accepts regular moderator and supermod access levels', () => {
        for (const requiredChatRole of ['everyone', 'moderator', 'supermod']) {
            const result = payload.validate({ name: 'hello', responseTemplate: 'Hello!', requiredChatRole });
            Assert.equal(result.error, undefined, requiredChatRole);
        }
        Assert.match(patchPayload.validate({ requiredChatRole: 'admin' }).error.message, /requiredChatRole/);
    });

    Test('command chat-role migration defaults existing command behavior to everyone', async (t) => {
        const knex = Knex({ client: 'better-sqlite3', connection: { filename: ':memory:' }, useNullAsDefault: true });
        t.after(() => knex.destroy());
        await knex.raw('PRAGMA foreign_keys = ON');
        for (const migration of migrations) await migration.up(knex);

        const [streamerId] = await knex('Streamer').insert({ slug: 'alice', displayName: 'Alice' });
        await knex('Command').insert({ streamerId, name: 'hello', responseTemplate: 'Hello!' });
        Assert.equal((await knex('Command').first()).requiredChatRole, 'everyone');

        await knex('Command').insert({ streamerId, name: 'mods', responseTemplate: 'Mods!', requiredChatRole: 'moderator' });
        Assert.equal((await knex('Command').where({ name: 'mods' }).first()).requiredChatRole, 'moderator');
    });
}
