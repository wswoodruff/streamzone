'use strict';

exports.up = async (knex) => {
    await knex.schema.createTable('PointAccount', (table) => {
        table.increments('id').primary();
        table.integer('streamerId').unsigned().notNullable().references('id').inTable('Streamer').onDelete('CASCADE');
        table.integer('chatUserId').unsigned().notNullable().references('id').inTable('ChatUser').onDelete('CASCADE');
        table.integer('availableBalance').notNullable().defaultTo(0);
        table.integer('lifetimeEarned').unsigned().notNullable().defaultTo(0);
        table.integer('lifetimeSpent').unsigned().notNullable().defaultTo(0);
        table.timestamp('createdAt').notNullable().defaultTo(knex.fn.now());
        table.timestamp('updatedAt').notNullable().defaultTo(knex.fn.now());
        table.unique(['streamerId', 'chatUserId']);
        table.check('?? >= 0', ['availableBalance']);
        table.check('?? >= 0', ['lifetimeEarned']);
        table.check('?? >= 0', ['lifetimeSpent']);
    });

    await knex.schema.createTable('EarningPolicy', (table) => {
        table.increments('id').primary();
        table.integer('streamerId').unsigned().notNullable().references('id').inTable('Streamer').onDelete('CASCADE');
        table.enum('eventType', ['participationInterval', 'commandOutcome', 'moderatorGrant']).notNullable();
        table.string('name', 120).notNullable();
        table.integer('points').unsigned().notNullable();
        table.integer('perSessionCap').unsigned().nullable();
        table.integer('perDayCap').unsigned().nullable();
        table.boolean('enabled').notNullable().defaultTo(true);
        table.timestamp('createdAt').notNullable().defaultTo(knex.fn.now());
        table.timestamp('updatedAt').notNullable().defaultTo(knex.fn.now());
        table.unique(['streamerId', 'eventType', 'name']);
        table.check('?? > 0', ['points']);
    });

    await knex.schema.createTable('PointLedgerEntry', (table) => {
        table.increments('id').primary();
        table.integer('accountId').unsigned().notNullable().references('id').inTable('PointAccount').onDelete('RESTRICT');
        table.integer('earningPolicyId').unsigned().nullable().references('id').inTable('EarningPolicy').onDelete('SET NULL');
        table.integer('streamSessionId').unsigned().nullable().references('id').inTable('StreamSession').onDelete('SET NULL');
        table.string('relatedExecutionId', 255).nullable();
        table.integer('delta').notNullable();
        table.enum('type', ['award', 'reserve', 'spend', 'refund', 'adjustment']).notNullable();
        table.string('reason', 255).notNullable();
        table.enum('actorType', ['system', 'moderator', 'user']).notNullable();
        table.string('actorId', 255).notNullable();
        table.string('idempotencyKey', 255).notNullable().unique();
        table.timestamp('createdAt').notNullable().defaultTo(knex.fn.now());
        table.check("(type IN ('award', 'refund') AND delta > 0) OR (type = 'reserve' AND delta < 0) OR (type IN ('spend', 'adjustment'))");
        table.index(['accountId', 'createdAt']);
        table.index(['earningPolicyId', 'createdAt']);
        table.index(['streamSessionId', 'accountId']);
    });
};

exports.down = async (knex) => {
    await knex.schema.dropTableIfExists('PointLedgerEntry');
    await knex.schema.dropTableIfExists('EarningPolicy');
    await knex.schema.dropTableIfExists('PointAccount');
};
