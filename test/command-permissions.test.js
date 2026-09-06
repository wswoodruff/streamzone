'use strict';

const Assert = require('node:assert/strict');
const Test = require('node:test');
const { CHAT_ROLES, relationshipRole, canRunCommand } = require('../lib/runtime/command-permissions');

Test('command chat roles distinguish viewers, moderators, and supermods', () => {
    Assert.deepEqual(CHAT_ROLES, ['everyone', 'moderator', 'supermod']);
    Assert.equal(relationshipRole([]), 'everyone');
    Assert.equal(relationshipRole([{ relationship: 'moderator' }]), 'moderator');
    Assert.equal(relationshipRole([{ relationship: 'moderator', tier: 'supermod' }]), 'supermod');
    Assert.equal(relationshipRole([{ relationship: 'broadcaster' }]), 'supermod');
    Assert.equal(relationshipRole({ moderator: true }), 'moderator');
    Assert.equal(relationshipRole({ supermod: true }), 'supermod');
});

Test('command chat role authorization is hierarchical and defaults to everyone', () => {
    const viewer = [];
    const moderator = [{ relationship: 'moderator' }];
    const supermod = [{ relationship: 'moderator', tier: 'supermod' }];

    Assert.equal(canRunCommand({}, viewer), true);
    Assert.equal(canRunCommand({ requiredChatRole: 'moderator' }, viewer), false);
    Assert.equal(canRunCommand({ requiredChatRole: 'moderator' }, moderator), true);
    Assert.equal(canRunCommand({ requiredChatRole: 'moderator' }, supermod), true);
    Assert.equal(canRunCommand({ requiredChatRole: 'supermod' }, moderator), false);
    Assert.equal(canRunCommand({ requiredChatRole: 'supermod' }, supermod), true);
    Assert.throws(() => canRunCommand({ requiredChatRole: 'admin' }, supermod), /Unknown command chat role/);
});
