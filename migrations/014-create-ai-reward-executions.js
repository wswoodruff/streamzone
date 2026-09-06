'use strict';

exports.up = async (knex) => {
    await knex.schema.createTable('AiRewardExecution', (table) => {
        table.increments('id').primary();
        table.integer('redemptionId').unsigned().notNullable().unique().references('id').inTable('RewardRedemption').onDelete('CASCADE');
        table.integer('streamerId').unsigned().notNullable().references('id').inTable('Streamer').onDelete('CASCADE');
        table.integer('chatUserId').unsigned().notNullable().references('id').inTable('ChatUser').onDelete('RESTRICT');
        table.integer('streamSessionId').unsigned().nullable().references('id').inTable('StreamSession').onDelete('SET NULL');
        table.string('provider', 80).notNullable();
        table.string('model', 160).notNullable();
        table.enum('status', ['dispatching', 'succeeded', 'refused', 'timed_out', 'provider_error', 'moderated']).notNullable();
        table.integer('inputTokens').unsigned().nullable();
        table.integer('outputTokens').unsigned().nullable();
        table.bigInteger('costMicros').unsigned().nullable();
        table.bigInteger('reservedCostMicros').unsigned().notNullable();
        table.integer('latencyMs').unsigned().nullable();
        table.string('errorCode', 80).nullable();
        table.string('errorCategory', 40).nullable();
        table.timestamp('createdAt').notNullable().defaultTo(knex.fn.now());
        table.timestamp('completedAt').nullable();
        table.index(['streamerId', 'streamSessionId', 'status']);
        table.index(['streamerId', 'chatUserId', 'status']);
    });

    await knex.schema.createTable('PointReservationSettlement', (table) => {
        table.increments('id').primary();
        table.integer('ledgerEntryId').unsigned().notNullable().unique().references('id').inTable('PointLedgerEntry').onDelete('RESTRICT');
        table.string('idempotencyKey', 255).notNullable().unique();
        table.timestamp('createdAt').notNullable().defaultTo(knex.fn.now());
    });
};

exports.down = async (knex) => {
    await knex.schema.dropTableIfExists('PointReservationSettlement');
    await knex.schema.dropTableIfExists('AiRewardExecution');
};
