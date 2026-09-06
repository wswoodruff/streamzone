'use strict';

exports.up = async (knex) => {
    await knex.schema.alterTable('Command', (table) => {
        table.string('cooldownScope', 20).notNullable().defaultTo('streamer');
    });
};

exports.down = async (knex) => {
    await knex.schema.alterTable('Command', (table) => {
        table.dropColumn('cooldownScope');
    });
};
