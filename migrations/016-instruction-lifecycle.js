'use strict';

exports.up = async (knex) => {
    await knex.schema.alterTable('StreamerInstructionVersion', (table) => {
        table.enum('status', ['draft', 'approved', 'rejected', 'active', 'superseded']).notNullable().defaultTo('draft');
        table.integer('revision').unsigned().notNullable().defaultTo(1);
        table.integer('validatedRevision').unsigned().nullable();
        table.json('findings').nullable();
        table.string('policyVersion', 120).nullable();
        table.string('checkerVersion', 120).nullable();
        table.integer('createdBy').unsigned().nullable().references('id').inTable('User').onDelete('SET NULL');
        table.integer('reviewedBy').unsigned().nullable().references('id').inTable('User').onDelete('SET NULL');
        table.integer('publishedBy').unsigned().nullable().references('id').inTable('User').onDelete('SET NULL');
        table.integer('basedOnVersionId').unsigned().nullable().references('id').inTable('StreamerInstructionVersion').onDelete('SET NULL');
        table.timestamp('validationRequestedAt').nullable();
        table.timestamp('reviewedAt').nullable();
        table.timestamp('warningsAcknowledgedAt').nullable();
        table.integer('warningsAcknowledgedBy').unsigned().nullable().references('id').inTable('User').onDelete('SET NULL');
        table.timestamp('publishedAt').nullable();
        table.timestamp('supersededAt').nullable();
        table.timestamp('updatedAt').notNullable().defaultTo(knex.fn.now());
    });
    // SQLite supports partial unique indexes; this is the final guard against two active versions.
    await knex.raw('CREATE UNIQUE INDEX streamer_instruction_one_active ON StreamerInstructionVersion(streamerId) WHERE status = \'active\'');
};

exports.down = async (knex) => {
    await knex.raw('DROP INDEX IF EXISTS streamer_instruction_one_active');
    await knex.schema.alterTable('StreamerInstructionVersion', (table) => {
        for (const column of ['status', 'revision', 'validatedRevision', 'findings', 'policyVersion', 'checkerVersion', 'createdBy', 'reviewedBy', 'publishedBy', 'basedOnVersionId', 'validationRequestedAt', 'reviewedAt', 'warningsAcknowledgedAt', 'warningsAcknowledgedBy', 'publishedAt', 'supersededAt', 'updatedAt']) table.dropColumn(column);
    });
};
