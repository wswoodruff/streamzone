'use strict';

const chatRoles = ['everyone', 'moderator', 'supermod', 'owner'];

exports.up = async (knex) => {
    await knex.schema.alterTable('Command', (table) => {
        table.string('requiredChatRole', 20).notNullable().defaultTo('everyone');
    });
};

exports.down = async (knex) => {
    await knex.schema.alterTable('Command', (table) => {
        table.dropColumn('requiredChatRole');
    });
};

exports.chatRoles = chatRoles;
