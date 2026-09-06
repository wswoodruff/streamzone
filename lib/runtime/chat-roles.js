'use strict';

const CHAT_ROLES = Object.freeze(['everyone', 'moderator', 'supermod', 'owner']);
const CHAT_ROLE_AUTHORITY = Object.freeze({ everyone: 0, moderator: 1, supermod: 2, owner: 3 });

const assertChatRole = (role) => {
    if (!Object.hasOwn(CHAT_ROLE_AUTHORITY, role)) throw new TypeError(`Unknown command chat role: ${role}.`);
    return role;
};

module.exports = { CHAT_ROLES, CHAT_ROLE_AUTHORITY, assertChatRole };
