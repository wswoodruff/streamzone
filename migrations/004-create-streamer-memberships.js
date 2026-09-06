'use strict';

exports.up = async (knex) => {
    await knex.schema.createTable('streamerMemberships', (table) => {
        table.integer('userId').unsigned().notNullable().references('id').inTable('users').onDelete('CASCADE');
        table.integer('streamerId').unsigned().notNullable().references('id').inTable('streamers').onDelete('CASCADE');
        table.enum('role', ['owner', 'admin', 'editor', 'viewer']).notNullable().defaultTo('viewer');
        table.timestamp('createdAt').notNullable().defaultTo(knex.fn.now());
        table.timestamp('updatedAt').notNullable().defaultTo(knex.fn.now());

        table.unique(['userId', 'streamerId']);
        table.index(['userId']);
        table.index(['streamerId']);
    });
};

exports.down = async (knex) => {
    await knex.schema.dropTableIfExists('streamerMemberships');
};
