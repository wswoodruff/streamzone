'use strict';

const { CHAT_ROLES, CHAT_ROLE_AUTHORITY, assertChatRole } = require('./chat-roles');

const relationshipRole = (relationships) => {
    if (!relationships) return 'everyone';

    if (!Array.isArray(relationships)) {
        if (relationships.owner || relationships.broadcaster) return 'owner';
        if (relationships.supermod) return 'supermod';
        if (relationships.moderator) return 'moderator';
        relationships = [relationships];
    }

    let role = 'everyone';
    for (const fact of relationships) {
        const relationship = typeof fact === 'string' ? fact : fact?.relationship;
        const tier = typeof fact === 'object' && fact?.tier ? String(fact.tier).toLowerCase() : null;
        if (relationship === 'owner' || relationship === 'broadcaster' || (relationship === 'moderator' && tier === 'owner')) return 'owner';
        if (relationship === 'supermod' || (relationship === 'moderator' && tier === 'supermod')) role = 'supermod';
        else if (relationship === 'moderator' && role === 'everyone') role = 'moderator';
    }
    return role;
};

const canRunCommand = (command, relationships) => {
    const required = assertChatRole(command?.requiredChatRole || 'everyone');
    return CHAT_ROLE_AUTHORITY[relationshipRole(relationships)] >= CHAT_ROLE_AUTHORITY[required];
};

module.exports = {
    CHAT_ROLES,
    roleAuthority: CHAT_ROLE_AUTHORITY,
    relationshipRole,
    canRunCommand
};
