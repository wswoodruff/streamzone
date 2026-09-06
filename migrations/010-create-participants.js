'use strict';

const addCounters = (table) => {
    table.integer('messageCount').unsigned().notNullable().defaultTo(0);
    table.integer('watchRewardCount').unsigned().notNullable().defaultTo(0);
    table.integer('winCount').unsigned().notNullable().defaultTo(0);
    table.integer('commandCount').unsigned().notNullable().defaultTo(0);
};

const addExclusions = (table) => {
    table.boolean('privacyExcluded').notNullable().defaultTo(false);
    table.boolean('moderationExcluded').notNullable().defaultTo(false);
};

exports.up = async (knex) => {
    await knex.schema.createTable('StreamerParticipant', (table) => {
        table.increments('id').primary();
        table.integer('streamerId').unsigned().notNullable().references('id').inTable('Streamer').onDelete('CASCADE');
        table.integer('chatUserId').unsigned().notNullable().references('id').inTable('ChatUser').onDelete('CASCADE');
        table.timestamp('firstSeenAt').notNullable();
        table.timestamp('lastSeenAt').notNullable();
        addCounters(table);
        addExclusions(table);
        table.timestamp('createdAt').notNullable().defaultTo(knex.fn.now());
        table.timestamp('updatedAt').notNullable().defaultTo(knex.fn.now());
        table.unique(['streamerId', 'chatUserId']);
        table.index(['streamerId', 'privacyExcluded', 'moderationExcluded']);
    });

    await knex.schema.createTable('StreamSessionParticipant', (table) => {
        table.increments('id').primary();
        table.integer('streamSessionId').unsigned().notNullable().references('id').inTable('StreamSession').onDelete('CASCADE');
        table.integer('chatUserId').unsigned().notNullable().references('id').inTable('ChatUser').onDelete('CASCADE');
        table.timestamp('joinedAt').notNullable();
        table.timestamp('lastActivityAt').notNullable();
        addCounters(table);
        addExclusions(table);
        table.timestamp('createdAt').notNullable().defaultTo(knex.fn.now());
        table.timestamp('updatedAt').notNullable().defaultTo(knex.fn.now());
        table.unique(['streamSessionId', 'chatUserId']);
        table.index(['streamSessionId', 'privacyExcluded', 'moderationExcluded']);
    });

    await knex.schema.createTable('ParticipantActivityEvent', (table) => {
        table.increments('id').primary();
        table.string('idempotencyKey', 255).notNullable().unique();
        table.integer('streamerId').unsigned().notNullable().references('id').inTable('Streamer').onDelete('CASCADE');
        table.integer('streamSessionId').unsigned().notNullable().references('id').inTable('StreamSession').onDelete('CASCADE');
        table.integer('chatUserId').unsigned().notNullable().references('id').inTable('ChatUser').onDelete('CASCADE');
        table.enum('type', ['message', 'watchReward', 'win', 'command']).notNullable();
        table.integer('amount').unsigned().notNullable();
        table.timestamp('occurredAt').notNullable();
        table.timestamp('createdAt').notNullable().defaultTo(knex.fn.now());
    });
};

exports.down = async (knex) => {
    await knex.schema.dropTableIfExists('ParticipantActivityEvent');
    await knex.schema.dropTableIfExists('StreamSessionParticipant');
    await knex.schema.dropTableIfExists('StreamerParticipant');
};
