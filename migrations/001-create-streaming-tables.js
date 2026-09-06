'use strict';

exports.up = async (knex) => {
    await knex.schema.createTable('Streamer', (table) => {
        table.increments('id').primary();
        table.string('slug', 80).notNullable().unique();
        table.string('displayName', 120).notNullable();
        table.timestamp('createdAt').notNullable().defaultTo(knex.fn.now());
    });

    await knex.schema.createTable('Source', (table) => {
        table.increments('id').primary();
        table.integer('streamerId').unsigned().notNullable().references('id').inTable('Streamer').onDelete('CASCADE');
        table.enum('provider', ['youtube', 'twitch']).notNullable();
        table.string('channelId', 255).notNullable();
        table.boolean('enabled').notNullable().defaultTo(true);
        table.timestamp('createdAt').notNullable().defaultTo(knex.fn.now());
        table.unique(['provider', 'channelId']);
    });

    await knex.schema.createTable('Stream', (table) => {
        table.increments('id').primary();
        table.integer('sourceId').unsigned().notNullable().references('id').inTable('Source').onDelete('CASCADE');
        table.string('externalId', 255).nullable();
        table.string('title', 255).nullable();
        table.enum('status', ['scheduled', 'live', 'offline']).notNullable().defaultTo('scheduled');
        table.timestamp('startedAt').nullable();
        table.timestamp('endedAt').nullable();
        table.timestamp('createdAt').notNullable().defaultTo(knex.fn.now());
        table.unique(['sourceId', 'externalId']);
        table.index(['status', 'startedAt']);
    });
};

exports.down = async (knex) => {
    await knex.schema.dropTableIfExists('Stream');
    await knex.schema.dropTableIfExists('Source');
    await knex.schema.dropTableIfExists('Streamer');
};
