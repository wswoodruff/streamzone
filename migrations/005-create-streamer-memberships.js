'use strict';

exports.up = async (knex) => {
    await knex.schema.createTable('StreamerMembership', (table) => {
        table.integer('userId').unsigned().notNullable().references('id').inTable('User').onDelete('CASCADE');
        table.integer('streamerId').unsigned().notNullable().references('id').inTable('Streamer').onDelete('CASCADE');
        table.enum('role', ['owner', 'admin', 'editor', 'viewer']).notNullable().defaultTo('viewer');
        table.timestamp('createdAt').notNullable().defaultTo(knex.fn.now());
        table.timestamp('updatedAt').notNullable().defaultTo(knex.fn.now());

        table.unique(['userId', 'streamerId']);
        table.index(['userId']);
        table.index(['streamerId']);
    });

    // Existing streamers deliberately remain unowned. Ownership is identity data and
    // cannot be inferred safely; administrators assign it from a reviewed ID mapping
    // with `npm run bootstrap:owners -- <mapping.json>` after this migration.
};

exports.down = async (knex) => {
    await knex.schema.dropTableIfExists('StreamerMembership');
};
