'use strict';

exports.up = async (knex) => {
    await knex.schema.createTable('ChatUser', (table) => {
        table.increments('id').primary();
        table.integer('userId').unsigned().nullable().references('id').inTable('User').onDelete('SET NULL');
        table.enum('status', ['active', 'merged']).notNullable().defaultTo('active');
        table.integer('mergedIntoChatUserId').unsigned().nullable().references('id').inTable('ChatUser').onDelete('SET NULL');
        table.timestamp('createdAt').notNullable().defaultTo(knex.fn.now());
        table.timestamp('updatedAt').notNullable().defaultTo(knex.fn.now());
        table.index('userId');
    });

    await knex.schema.createTable('ChatIdentity', (table) => {
        table.increments('id').primary();
        table.integer('chatUserId').unsigned().notNullable().references('id').inTable('ChatUser').onDelete('CASCADE');
        table.string('provider', 40).notNullable();
        table.string('providerUserId', 255).notNullable();
        table.string('handle', 255).nullable();
        table.string('displayName', 255).nullable();
        table.string('avatarUrl', 2048).nullable();
        table.timestamp('lastSeenAt').notNullable();
        table.timestamp('createdAt').notNullable().defaultTo(knex.fn.now());
        table.timestamp('updatedAt').notNullable().defaultTo(knex.fn.now());
        table.unique(['provider', 'providerUserId']);
        table.index('chatUserId');
    });
};

exports.down = async (knex) => {
    await knex.schema.dropTableIfExists('ChatIdentity');
    await knex.schema.dropTableIfExists('ChatUser');
};
