'use strict';

exports.up = async (knex) => {
    await knex.schema.createTable('User', (table) => {
        table.increments('id').primary();
        table.string('email', 254).notNullable().unique();
        table.string('displayName', 120).notNullable();
        table.string('passwordHash', 255).notNullable();
        table.timestamp('createdAt').notNullable().defaultTo(knex.fn.now());
    });

    await knex.schema.createTable('Session', (table) => {
        table.string('id', 64).primary();
        table.integer('userId').unsigned().notNullable().references('id').inTable('User').onDelete('CASCADE');
        table.timestamp('expiresAt').notNullable();
        table.timestamp('createdAt').notNullable().defaultTo(knex.fn.now());
        table.index(['userId', 'expiresAt']);
    });
};

exports.down = async (knex) => {
    await knex.schema.dropTableIfExists('Session');
    await knex.schema.dropTableIfExists('User');
};
