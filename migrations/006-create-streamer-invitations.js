'use strict';

exports.up = async (knex) => {
    await knex.schema.createTable('StreamerInvitation', (table) => {
        table.increments('id').primary();
        table.integer('streamerId').unsigned().notNullable().references('id').inTable('Streamer').onDelete('CASCADE');
        table.string('inviteeEmail', 254).notNullable();
        table.enum('role', ['owner', 'admin', 'editor', 'viewer']).notNullable();
        table.integer('inviterUserId').unsigned().notNullable().references('id').inTable('User').onDelete('CASCADE');
        table.string('tokenHash', 64).notNullable().unique();
        table.timestamp('expiresAt').notNullable();
        table.timestamp('acceptedAt').nullable();
        table.timestamp('revokedAt').nullable();
        table.timestamp('createdAt').notNullable().defaultTo(knex.fn.now());
        table.index(['streamerId', 'inviteeEmail']);
    });
    await knex.raw('CREATE UNIQUE INDEX `StreamerInvitation_active_email_unique` ON `StreamerInvitation` (`streamerId`, `inviteeEmail`) WHERE `acceptedAt` IS NULL AND `revokedAt` IS NULL');
};

exports.down = (knex) => knex.schema.dropTableIfExists('StreamerInvitation');
