'use strict';

exports.up = async (knex) => {
    await knex.schema.createTable('RewardDefinition', (table) => {
        table.increments('id').primary();
        table.integer('streamerId').unsigned().notNullable().references('id').inTable('Streamer').onDelete('CASCADE');
        table.string('name', 120).notNullable();
        table.text('description').notNullable().defaultTo('');
        table.integer('pointCost').unsigned().notNullable();
        table.boolean('enabled').notNullable().defaultTo(true);
        table.enum('fulfillmentType', ['deterministicBot', 'manual', 'ai']).notNullable();
        table.integer('perUserCooldownSeconds').unsigned().nullable();
        table.integer('globalCooldownSeconds').unsigned().nullable();
        table.integer('perStreamLimit').unsigned().nullable();
        table.json('eligibilityPolicy').notNullable();
        table.timestamp('createdAt').notNullable().defaultTo(knex.fn.now());
        table.timestamp('updatedAt').notNullable().defaultTo(knex.fn.now());
        table.unique(['streamerId', 'name']);
        table.check('?? > 0', ['pointCost']);
    });

    // Configuration is intentionally isolated so participant reward responses can
    // never accidentally expose executor credentials or implementation details.
    await knex.schema.createTable('RewardExecutorConfiguration', (table) => {
        table.integer('rewardDefinitionId').unsigned().primary().references('id').inTable('RewardDefinition').onDelete('CASCADE');
        table.json('configuration').notNullable();
        table.timestamp('updatedAt').notNullable().defaultTo(knex.fn.now());
    });

    await knex.schema.createTable('RewardRedemption', (table) => {
        table.increments('id').primary();
        table.integer('streamerId').unsigned().notNullable().references('id').inTable('Streamer').onDelete('CASCADE');
        table.integer('rewardDefinitionId').unsigned().notNullable().references('id').inTable('RewardDefinition').onDelete('RESTRICT');
        table.integer('chatUserId').unsigned().notNullable().references('id').inTable('ChatUser').onDelete('RESTRICT');
        table.integer('streamSessionId').unsigned().nullable().references('id').inTable('StreamSession').onDelete('SET NULL');
        table.integer('pointCost').unsigned().notNullable();
        table.enum('status', ['requested', 'reserved', 'fulfilled', 'rejected', 'cancelled', 'refunded']).notNullable();
        table.string('idempotencyKey', 255).notNullable();
        table.string('failureCode', 80).nullable();
        table.text('failureDetails').nullable();
        table.timestamp('createdAt').notNullable().defaultTo(knex.fn.now());
        table.timestamp('updatedAt').notNullable().defaultTo(knex.fn.now());
        table.timestamp('fulfilledAt').nullable();
        table.unique(['streamerId', 'chatUserId', 'idempotencyKey']);
        table.index(['rewardDefinitionId', 'status', 'createdAt']);
        table.index(['chatUserId', 'streamerId', 'createdAt']);
    });
};

exports.down = async (knex) => {
    await knex.schema.dropTableIfExists('RewardRedemption');
    await knex.schema.dropTableIfExists('RewardExecutorConfiguration');
    await knex.schema.dropTableIfExists('RewardDefinition');
};
