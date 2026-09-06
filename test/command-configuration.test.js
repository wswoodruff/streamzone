'use strict';

const Assert = require('node:assert/strict');
const Test = require('node:test');
const { CHAT_ROLES } = require('../lib/runtime/chat-roles');

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
    const migration = require('../migrations/001-initial-schema');

    const makeDatabase = async () => {
        const knex = Knex({ client: 'better-sqlite3', connection: { filename: ':memory:' }, useNullAsDefault: true });
        await knex.raw('PRAGMA foreign_keys = ON');
        await migration.up(knex);
        return knex;
    };

    Test('command validation uses the canonical chat-role domain', () => {
        Assert.deepEqual(CHAT_ROLES, ['everyone', 'moderator', 'supermod', 'owner']);
        for (const requiredChatRole of CHAT_ROLES) {
            const result = payload.validate({ name: 'hello', responseTemplate: 'Hello!', requiredChatRole });
            Assert.equal(result.error, undefined, requiredChatRole);
        }
        Assert.match(patchPayload.validate({ requiredChatRole: 'admin' }).error.message, /requiredChatRole/);
    });

    Test('canonical command schema defaults to everyone and enforces the same role domain', async (t) => {
        const knex = await makeDatabase();
        t.after(() => knex.destroy());
        const [streamerId] = await knex('Streamer').insert({ slug: 'alice', displayName: 'Alice' });

        await knex('Command').insert({ streamerId, name: 'hello', responseTemplate: 'Hello!' });
        Assert.equal((await knex('Command').first()).requiredChatRole, 'everyone');
        for (const [index, requiredChatRole] of CHAT_ROLES.entries()) {
            await knex('Command').insert({ streamerId, name: `role-${index}`, responseTemplate: 'Role!', requiredChatRole });
        }
        await Assert.rejects(
            knex('Command').insert({ streamerId, name: 'invalid', responseTemplate: 'Invalid!', requiredChatRole: 'admin' }),
            /constraint|check/i
        );
        Assert.deepEqual(await knex.raw('PRAGMA foreign_key_check'), []);
    });
}
