'use strict';

exports.up = async (knex) => {
    await knex.schema.createTable('StreamSession', (table) => {
        table.increments('id').primary();
        table.integer('streamerId').unsigned().notNullable().references('id').inTable('Streamer').onDelete('CASCADE');
        table.string('title', 255).notNullable();
        table.enum('status', ['scheduled', 'live', 'ended']).notNullable().defaultTo('scheduled');
        table.timestamp('scheduledAt').nullable();
        table.timestamp('startedAt').nullable();
        table.timestamp('endedAt').nullable();
        table.json('publicMetadata').nullable();
        table.timestamp('createdAt').notNullable().defaultTo(knex.fn.now());
        table.timestamp('updatedAt').notNullable().defaultTo(knex.fn.now());
        table.index(['streamerId', 'status', 'scheduledAt']);
    });

    await knex.schema.alterTable('Stream', (table) => {
        // Nullable by design: legacy occurrences remain usable throughout the
        // compatibility/backfill period and are only grouped when unambiguous.
        table.integer('streamSessionId').unsigned().nullable().references('id').inTable('StreamSession').onDelete('SET NULL');
        table.index('streamSessionId');
        table.unique(['streamSessionId', 'sourceId']);
    });
};

exports.down = async (knex) => {
    await knex.schema.alterTable('Stream', (table) => {
        table.dropUnique(['streamSessionId', 'sourceId']);
        table.dropIndex('streamSessionId');
        table.dropColumn('streamSessionId');
    });
    await knex.schema.dropTableIfExists('StreamSession');
};
