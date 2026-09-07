'use strict';

exports.up = async (knex) => {
    await knex.schema.createTable('ExternalLoginIdentity', (table) => {
        table.increments('id').primary();
        table.string('provider', 40).notNullable();
        table.string('providerSubject', 255).notNullable();
        table.integer('userId').unsigned().notNullable().references('id').inTable('User').onDelete('CASCADE');
        table.timestamp('createdAt').notNullable().defaultTo(knex.fn.now());
        table.timestamp('updatedAt').notNullable().defaultTo(knex.fn.now());
        table.unique(['provider', 'providerSubject']);
        table.unique(['provider', 'userId']);
        table.index('userId');
    });

    await knex.schema.createTable('ProviderConnection', (table) => {
        table.increments('id').primary();
        table.integer('streamerId').unsigned().notNullable().references('id').inTable('Streamer').onDelete('CASCADE');
        table.integer('authorizedByUserId').unsigned().notNullable().references('id').inTable('User').onDelete('RESTRICT');
        table.string('provider', 40).notNullable();
        table.string('providerAccountId', 255).notNullable();
        table.string('providerChannelId', 255).nullable();
        table.json('grantedScopes').notNullable();
        table.enum('status', ['active', 'reconnect_required', 'revoked']).notNullable().defaultTo('active');
        table.timestamp('tokenExpiresAt').nullable();
        table.string('reconnectReason', 255).nullable();
        table.timestamp('revokedAt').nullable();
        table.integer('revokedByUserId').unsigned().nullable().references('id').inTable('User').onDelete('SET NULL');
        table.string('revocationReason', 255).nullable();
        table.timestamp('createdAt').notNullable().defaultTo(knex.fn.now());
        table.timestamp('updatedAt').notNullable().defaultTo(knex.fn.now());
        table.unique(['streamerId', 'provider', 'providerAccountId']);
        table.index(['streamerId', 'provider', 'status']);
    });

    await knex.schema.createTable('ProviderCredential', (table) => {
        table.integer('providerConnectionId').unsigned().primary().references('id').inTable('ProviderConnection').onDelete('CASCADE');
        table.text('accessTokenCiphertext').notNullable();
        table.text('refreshTokenCiphertext').nullable();
        table.string('keyVersion', 40).notNullable();
        table.timestamp('createdAt').notNullable().defaultTo(knex.fn.now());
        table.timestamp('updatedAt').notNullable().defaultTo(knex.fn.now());
    });

    await knex.schema.createTable('OAuthAuthorizationState', (table) => {
        table.string('stateHash', 64).primary();
        table.enum('purpose', ['dashboard_login', 'provider_connection']).notNullable();
        table.string('provider', 40).notNullable();
        table.integer('userId').unsigned().nullable().references('id').inTable('User').onDelete('CASCADE');
        table.integer('streamerId').unsigned().nullable().references('id').inTable('Streamer').onDelete('CASCADE');
        table.string('pkceVerifier', 128).notNullable();
        table.string('nonce', 128).notNullable();
        table.timestamp('expiresAt').notNullable();
        table.timestamp('consumedAt').nullable();
        table.timestamp('createdAt').notNullable().defaultTo(knex.fn.now());
        table.index('expiresAt');
    });
};

exports.down = async (knex) => {
    await knex.schema.dropTableIfExists('OAuthAuthorizationState');
    await knex.schema.dropTableIfExists('ProviderCredential');
    await knex.schema.dropTableIfExists('ProviderConnection');
    await knex.schema.dropTableIfExists('ExternalLoginIdentity');
};
