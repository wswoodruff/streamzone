'use strict';

const CHAT_ROLES = Object.freeze(['everyone', 'moderator', 'supermod']);
const roleAuthority = Object.freeze({ everyone: 0, moderator: 1, supermod: 2 });

const assertRole = (role) => {
    if (!Object.hasOwn(roleAuthority, role)) throw new TypeError(`Unknown command chat role: ${role}.`);
    return role;
};

const relationshipRole = (relationships) => {
    if (!relationships) return 'everyone';

    if (!Array.isArray(relationships)) {
        if (relationships.broadcaster || relationships.supermod) return 'supermod';
        if (relationships.moderator) return 'moderator';
        relationships = [relationships];
    }

    let role = 'everyone';
    for (const fact of relationships) {
        const relationship = typeof fact === 'string' ? fact : fact?.relationship;
        const tier = typeof fact === 'object' && fact?.tier ? String(fact.tier).toLowerCase() : null;
        if (relationship === 'broadcaster') return 'supermod';
        if (relationship === 'moderator' && tier === 'supermod') return 'supermod';
        if (relationship === 'moderator') role = 'moderator';
    }
    return role;
};

const canRunCommand = (command, relationships) => {
    const required = assertRole(command?.requiredChatRole || 'everyone');
    return roleAuthority[relationshipRole(relationships)] >= roleAuthority[required];
};

module.exports = { CHAT_ROLES, roleAuthority, relationshipRole, canRunCommand };
