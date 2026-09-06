'use strict';

exports.up = async (knex) => {
    await knex.schema.createTable('Command', (table) => {
        table.increments('id').primary();
        table.integer('streamerId').unsigned().notNullable().references('id').inTable('Streamer').onDelete('CASCADE');
        table.string('name', 50).notNullable();
        table.string('responseTemplate', 1000).notNullable();
        table.boolean('enabled').notNullable().defaultTo(true);
        table.integer('cooldownSeconds').unsigned().notNullable().defaultTo(0);
        table.timestamp('createdAt').notNullable().defaultTo(knex.fn.now());
        table.timestamp('updatedAt').notNullable().defaultTo(knex.fn.now());
        table.unique(['streamerId', 'name']);
        table.index(['streamerId', 'enabled']);
    });
};

exports.down = async (knex) => {
    await knex.schema.dropTableIfExists('Command');
};
