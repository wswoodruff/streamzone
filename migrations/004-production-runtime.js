'use strict';

exports.up = async (knex) => {
    await knex.schema.createTable('RuntimeLease', (table) => {
        table.string('key', 320).primary(); table.string('ownerId', 80).notNullable();
        table.timestamp('expiresAt').notNullable(); table.timestamp('updatedAt').notNullable();
    });
    await knex.schema.createTable('RuntimeCursor', (table) => {
        table.string('key', 320).primary(); table.text('pageToken').nullable();
        table.integer('pollingIntervalMs').unsigned().notNullable().defaultTo(5000); table.timestamp('updatedAt').notNullable();
    });
    await knex.schema.createTable('RuntimeEvent', (table) => {
        table.string('key', 320).primary(); table.enum('status', ['processing', 'completed', 'terminal_failure']).notNullable();
        table.string('ownerId', 80).notNullable(); table.timestamp('leaseExpiresAt').notNullable(); table.text('outcome').nullable();
        table.timestamp('completedAt').nullable(); table.timestamp('createdAt').notNullable(); table.timestamp('updatedAt').notNullable();
    });
    await knex.schema.createTable('RuntimeCooldown', (table) => { table.string('key', 320).primary(); table.timestamp('availableAt').notNullable(); });
    await knex.schema.createTable('RuntimeDelivery', (table) => {
        table.string('eventKey', 320).primary(); table.enum('status', ['sending', 'sent', 'terminal_failure']).notNullable();
        table.string('providerMessageId', 255).nullable(); table.string('errorCode', 80).nullable();
        table.integer('attempts').unsigned().notNullable().defaultTo(0); table.timestamp('updatedAt').notNullable();
    });
};

exports.down = async (knex) => {
    for (const table of ['RuntimeDelivery', 'RuntimeCooldown', 'RuntimeEvent', 'RuntimeCursor', 'RuntimeLease']) await knex.schema.dropTableIfExists(table);
};
