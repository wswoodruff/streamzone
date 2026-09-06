'use strict';

const Assert = require('node:assert/strict');
const Test = require('node:test');
const { CHAT_ROLES, relationshipRole, canRunCommand } = require('../lib/runtime/command-permissions');

Test('command chat roles distinguish viewers, moderators, supermods, and owners', () => {
    Assert.deepEqual(CHAT_ROLES, ['everyone', 'moderator', 'supermod', 'owner']);
    Assert.equal(relationshipRole([]), 'everyone');
    Assert.equal(relationshipRole([{ relationship: 'moderator' }]), 'moderator');
    Assert.equal(relationshipRole([{ relationship: 'moderator', tier: 'supermod' }]), 'supermod');
    Assert.equal(relationshipRole([{ relationship: 'broadcaster' }]), 'owner');
    Assert.equal(relationshipRole([{ relationship: 'owner' }]), 'owner');
    Assert.equal(relationshipRole({ moderator: true }), 'moderator');
    Assert.equal(relationshipRole({ supermod: true }), 'supermod');
    Assert.equal(relationshipRole({ owner: true }), 'owner');
    Assert.equal(relationshipRole({ broadcaster: true }), 'owner');
});

Test('command chat role authorization is hierarchical and defaults to everyone', () => {
    const viewer = [];
    const moderator = [{ relationship: 'moderator' }];
    const supermod = [{ relationship: 'moderator', tier: 'supermod' }];
    const owner = [{ relationship: 'broadcaster' }];

    Assert.equal(canRunCommand({}, viewer), true);
    Assert.equal(canRunCommand({ requiredChatRole: 'moderator' }, viewer), false);
    Assert.equal(canRunCommand({ requiredChatRole: 'moderator' }, moderator), true);
    Assert.equal(canRunCommand({ requiredChatRole: 'moderator' }, supermod), true);
    Assert.equal(canRunCommand({ requiredChatRole: 'moderator' }, owner), true);
    Assert.equal(canRunCommand({ requiredChatRole: 'supermod' }, moderator), false);
    Assert.equal(canRunCommand({ requiredChatRole: 'supermod' }, supermod), true);
    Assert.equal(canRunCommand({ requiredChatRole: 'supermod' }, owner), true);
    Assert.equal(canRunCommand({ requiredChatRole: 'owner' }, supermod), false);
    Assert.equal(canRunCommand({ requiredChatRole: 'owner' }, owner), true);
    Assert.throws(() => canRunCommand({ requiredChatRole: 'admin' }, owner), /Unknown command chat role/);
});
