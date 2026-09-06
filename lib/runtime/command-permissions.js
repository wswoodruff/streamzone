'use strict';

const CHAT_ROLES = Object.freeze(['everyone', 'moderator', 'supermod', 'owner']);
const roleAuthority = Object.freeze({ everyone: 0, moderator: 1, supermod: 2, owner: 3 });

const assertRole = (role) => {
    if (!Object.hasOwn(roleAuthority, role)) throw new TypeError(`Unknown command chat role: ${role}.`);
    return role;
};

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
    const required = assertRole(command?.requiredChatRole || 'everyone');
    return roleAuthority[relationshipRole(relationships)] >= roleAuthority[required];
};

module.exports = { CHAT_ROLES, roleAuthority, relationshipRole, canRunCommand };
