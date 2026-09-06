'use strict';

exports.up = async (knex) => {
    await knex.schema.createTable('StreamSessionState', (table) => {
        table.increments('id').primary();
        table.integer('streamSessionId').unsigned().notNullable().references('id').inTable('StreamSession').onDelete('CASCADE');
        table.string('namespace', 100).notNullable();
        table.string('key', 160).notNullable();
        table.text('serializedValue').notNullable();
        table.integer('sizeBytes').unsigned().notNullable();
        table.integer('version').unsigned().notNullable().defaultTo(1);
        // Required only for the exceptional case where message-derived content is stored.
        table.string('purpose', 255).nullable();
        table.timestamp('expiresAt').nullable();
        table.timestamp('createdAt').notNullable().defaultTo(knex.fn.now());
        table.timestamp('updatedAt').notNullable().defaultTo(knex.fn.now());
        table.unique(['streamSessionId', 'namespace', 'key']);
        table.index(['streamSessionId', 'expiresAt']);
        table.index('expiresAt');
    });
};

exports.down = async (knex) => {
    await knex.schema.dropTableIfExists('StreamSessionState');
};
