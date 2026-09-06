'use strict';

exports.up = async (knex) => {
    await knex.schema.createTable('AiInvocation', (table) => {
        table.increments('id').primary();
        table.integer('streamerId').unsigned().notNullable().references('id').inTable('Streamer').onDelete('CASCADE');
        table.integer('streamSessionId').unsigned().notNullable().references('id').inTable('StreamSession').onDelete('RESTRICT');
        table.integer('chatUserId').unsigned().notNullable().references('id').inTable('ChatUser').onDelete('RESTRICT');
        table.integer('chatIdentityId').unsigned().notNullable().references('id').inTable('ChatIdentity').onDelete('RESTRICT');
        table.string('configurationVersion', 120).notNullable();
        table.integer('instructionVersionId').unsigned().notNullable().references('id').inTable('StreamerInstructionVersion').onDelete('RESTRICT');
        table.string('idempotencyKey', 255).notNullable();
        table.integer('quotedPointCost').unsigned().notNullable();
        table.enum('status', ['reserved', 'dispatching', 'succeeded', 'rejected', 'cooldown', 'insufficient_balance', 'timed_out', 'provider_failed', 'unsafe_output', 'cancelled', 'delivery_failed']).notNullable();
        table.enum('reservationStatus', ['reserved', 'committed', 'released']).notNullable();
        table.string('reasonCode', 80).nullable();
        table.json('usageMetadata').nullable();
        table.integer('reservationLedgerEntryId').unsigned().notNullable().unique().references('id').inTable('PointLedgerEntry').onDelete('RESTRICT');
        table.timestamp('createdAt').notNullable().defaultTo(knex.fn.now());
        table.timestamp('updatedAt').notNullable().defaultTo(knex.fn.now());
        table.timestamp('startedAt').nullable();
        table.timestamp('completedAt').nullable();
        table.unique(['streamerId', 'chatIdentityId', 'idempotencyKey']);
        table.index(['status', 'reservationStatus', 'updatedAt']);
        table.check('?? > 0', ['quotedPointCost']);
    });
};

exports.down = (knex) => knex.schema.dropTableIfExists('AiInvocation');
