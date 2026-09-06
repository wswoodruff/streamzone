'use strict';

const relationshipTypes = ['follower', 'subscriber', 'paid_member', 'moderator', 'vip', 'broadcaster'];

exports.up = async (knex) => {
    await knex.schema.createTable('ChannelRelationship', (table) => {
        table.increments('id').primary();
        table.integer('sourceId').unsigned().notNullable().references('id').inTable('Source').onDelete('CASCADE');
        table.integer('chatIdentityId').unsigned().notNullable().references('id').inTable('ChatIdentity').onDelete('CASCADE');
        table.enum('relationship', relationshipTypes).notNullable();
        table.string('tier', 100).nullable();
        table.timestamp('observedAt').notNullable();
        table.timestamp('expiresAt').nullable();
        table.timestamp('createdAt').notNullable().defaultTo(knex.fn.now());
        table.timestamp('updatedAt').notNullable().defaultTo(knex.fn.now());
        table.unique(['sourceId', 'chatIdentityId', 'relationship']);
        table.index(['sourceId', 'chatIdentityId']);
        table.index('expiresAt');
    });
};

exports.down = async (knex) => {
    await knex.schema.dropTableIfExists('ChannelRelationship');
};

exports.relationshipTypes = relationshipTypes;
