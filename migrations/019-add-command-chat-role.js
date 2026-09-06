'use strict';

const chatRoles = ['everyone', 'moderator', 'supermod'];

exports.up = async (knex) => {
    await knex.schema.alterTable('Command', (table) => {
        table.enum('requiredChatRole', chatRoles).notNullable().defaultTo('everyone');
    });
};

exports.down = async (knex) => {
    await knex.schema.alterTable('Command', (table) => {
        table.dropColumn('requiredChatRole');
    });
};

exports.chatRoles = chatRoles;
