'use strict';

exports.up = async (knex) => {
    await knex.schema.alterTable('Command', (table) => {
        table.string('requiredChatRole', 20).notNullable().defaultTo('everyone').alter();
    });
};

exports.down = async (knex) => {
    await knex('Command').where({ requiredChatRole: 'owner' }).update({ requiredChatRole: 'supermod' });
};
