'use strict';

exports.up = async (knex) => {
    await knex.schema.createTable('StreamerInstructionVersion', (table) => {
        table.increments('id').primary();
        table.integer('streamerId').unsigned().notNullable().references('id').inTable('Streamer').onDelete('CASCADE');
        table.text('instruction').notNullable();
        table.timestamp('createdAt').notNullable().defaultTo(knex.fn.now());
        table.index(['streamerId', 'createdAt']);
    });
    await knex.schema.alterTable('AiRewardExecution', (table) => {
        table.string('platformPolicyVersionId', 120).nullable();
        table.integer('streamerInstructionVersionId').unsigned().nullable().references('id').inTable('StreamerInstructionVersion').onDelete('RESTRICT');
    });
};

exports.down = async (knex) => {
    await knex.schema.alterTable('AiRewardExecution', (table) => {
        table.dropColumn('streamerInstructionVersionId');
        table.dropColumn('platformPolicyVersionId');
    });
    await knex.schema.dropTableIfExists('StreamerInstructionVersion');
};
