'use strict';

const Assert = require('node:assert/strict');
const Test = require('node:test');
const { addMembership, createTenant, createUser, injectAuthenticated, startServer } = require('./helpers/server');

const aiPayload = (streamerId, overrides = {}) => ({
    streamerId,
    enabled: 'true',
    invocationCommand: 'ask',
    provider: 'openai',
    model: 'gpt-5',
    pointCost: '25',
    cooldownSeconds: '10',
    cooldownScope: 'participant',
    maxInputChars: '1800',
    maxOutputChars: '1600',
    maxOutputTokenCount: '400',
    timeoutMs: '4500',
    ...overrides
});

Test('owner management dashboard exposes team, invitations, reward boundaries, points, and standalone AI lifecycle state', async (t) => {
    const context = await startServer(t);
    const owner = await createUser(context, { displayName: 'Owner Account' });
    const helper = await createUser(context, { displayName: 'Viewer Helper' });
    const streamer = await createTenant(context, owner, 'owner', { displayName: 'Managed Creator', slug: 'managed' });
    await addMembership(context, helper, streamer, 'viewer');
    await context.services.invitationService.create(owner.user.id, streamer.id, { email: 'pending@example.com', role: 'editor' });
    await context.services.rewardService.createReward(owner.user.id, streamer.id, {
        name: 'Hydrate', description: 'Take a sip', pointCost: 50, enabled: true, fulfillmentType: 'manual',
        perUserCooldownSeconds: 30, globalCooldownSeconds: null, perStreamLimit: 2,
        eligibilityPolicy: { membership: 'any', providers: [] }, executorConfiguration: {}
    });
    await context.services.rewardService.createReward(owner.user.id, streamer.id, {
        name: 'Celebrate', description: 'Post a celebration', pointCost: 125, enabled: true, fulfillmentType: 'deterministicBot',
        perUserCooldownSeconds: null, globalCooldownSeconds: 60, perStreamLimit: null,
        eligibilityPolicy: { membership: 'member', providers: [] }, executorConfiguration: { action: 'sendChat', parameters: {} }
    });
    await context.models.EarningPolicy.query().insert({ streamerId: streamer.id, eventType: 'participationInterval', name: 'Watch time', points: 5, perSessionCap: 100, perDayCap: 250, enabled: true });
    await context.services.aiFeatureService.updateConfiguration(owner.user.id, streamer.id, {
        enabled: true, invocationCommand: 'ask', provider: 'openai', model: 'gpt-5', pointCost: 25,
        cooldownSeconds: 10, cooldownScope: 'participant', maxInputChars: 1800, maxOutputChars: 1600,
        maxOutputTokenCount: 400, timeoutMs: 4500
    });
    const draft = await context.services.instructionService.createDraft(owner.user.id, streamer.id, 'Keep responses concise and relevant.');
    await context.services.instructionService.requestValidation(owner.user.id, streamer.id, draft.id);
    await context.services.instructionService.publish(owner.user.id, streamer.id, draft.id);

    const response = await injectAuthenticated(context, owner, { method: 'GET', url: `/dashboard?streamerId=${streamer.id}` });
    Assert.equal(response.statusCode, 200);
    for (const expected of [
        'Viewer Helper', 'pending@example.com', 'Viewer', 'Editor', 'Admin', 'Owner', 'Final owner',
        'Hydrate', 'Manual', 'Celebrate', 'Deterministic bot', 'AI is not a reward type', 'Watch time',
        '!ask', 'gpt-5', '10s · participant', 'Streamer instructions', 'Keep responses concise and relevant.'
    ]) Assert.match(response.result, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    Assert.match(response.result, /name="fulfillmentType"/);
    Assert.doesNotMatch(response.result, /<option value="ai"/i);
});

Test('dashboard team and reward actions use existing authorization and reward services', async (t) => {
    const context = await startServer(t);
    const owner = await createUser(context, { displayName: 'Owner Account' });
    const helper = await createUser(context, { displayName: 'Helper Account' });
    const streamer = await createTenant(context, owner, 'owner');
    await addMembership(context, helper, streamer, 'viewer');

    const finalOwnerRemoval = await injectAuthenticated(context, owner, {
        method: 'POST', url: '/dashboard/team', payload: { streamerId: streamer.id, action: 'remove-member', userId: owner.user.id }
    });
    Assert.equal(finalOwnerRemoval.statusCode, 303);
    Assert.match(finalOwnerRemoval.headers.location, /error=final-owner/);
    Assert.ok(await context.models.StreamerMembership.query().findOne({ streamerId: streamer.id, userId: owner.user.id }));

    const roleUpdate = await injectAuthenticated(context, owner, {
        method: 'POST', url: '/dashboard/team', payload: { streamerId: streamer.id, action: 'update-member', userId: helper.user.id, role: 'editor' }
    });
    Assert.equal(roleUpdate.statusCode, 303);
    Assert.match(roleUpdate.headers.location, /notice=member-updated/);
    Assert.equal((await context.models.StreamerMembership.query().findOne({ streamerId: streamer.id, userId: helper.user.id })).role, 'editor');

    const invitationCreate = await injectAuthenticated(context, owner, {
        method: 'POST', url: '/dashboard/team', payload: { streamerId: streamer.id, action: 'create-invite', email: 'new-admin@example.com', role: 'admin' }
    });
    Assert.equal(invitationCreate.statusCode, 303);
    const invitation = await context.models.StreamerInvitation.query().findOne({ streamerId: streamer.id, inviteeEmail: 'new-admin@example.com' });
    Assert.ok(invitation);

    const invitationRevoke = await injectAuthenticated(context, owner, {
        method: 'POST', url: '/dashboard/team', payload: { streamerId: streamer.id, action: 'revoke-invite', invitationId: invitation.id }
    });
    Assert.equal(invitationRevoke.statusCode, 303);
    Assert.ok((await context.models.StreamerInvitation.query().findById(invitation.id)).revokedAt);

    const rewardCreate = await injectAuthenticated(context, owner, {
        method: 'POST', url: '/dashboard/rewards', payload: {
            streamerId: streamer.id, action: 'create', name: 'Shout out', description: 'Send chat', pointCost: 75,
            enabled: true, fulfillmentType: 'deterministicBot', executorAction: 'sendChat', eligibilityMembership: 'any',
            perUserCooldownSeconds: '', globalCooldownSeconds: 30, perStreamLimit: ''
        }
    });
    Assert.equal(rewardCreate.statusCode, 303);
    const reward = await context.models.RewardDefinition.query().findOne({ streamerId: streamer.id, name: 'Shout out' });
    Assert.equal(reward.fulfillmentType, 'deterministicBot');
    const executor = await context.models.RewardExecutorConfiguration.query().findById(reward.id);
    Assert.equal(executor.configuration.action, 'sendChat');

    const rewardUpdate = await injectAuthenticated(context, owner, {
        method: 'POST', url: '/dashboard/rewards', payload: {
            streamerId: streamer.id, action: 'update', rewardId: reward.id, name: 'Shout out', description: 'Updated', pointCost: 90,
            enabled: false, perUserCooldownSeconds: 15, globalCooldownSeconds: '', perStreamLimit: 3
        }
    });
    Assert.equal(rewardUpdate.statusCode, 303);
    const updatedReward = await context.models.RewardDefinition.query().findById(reward.id);
    Assert.equal(Number(updatedReward.pointCost), 90);
    Assert.equal(updatedReward.enabled, false);
    Assert.equal(updatedReward.fulfillmentType, 'deterministicBot');
    Assert.equal(updatedReward.eligibilityPolicy.membership, 'any');
});

Test('standalone AI management updates configuration without reward coupling and exposes the instruction lifecycle', async (t) => {
    const context = await startServer(t);
    const owner = await createUser(context, { displayName: 'Owner Account' });
    const viewer = await createUser(context, { displayName: 'Viewer Account' });
    const streamer = await createTenant(context, owner, 'owner');
    await addMembership(context, viewer, streamer, 'viewer');

    const beforeRewards = await context.models.RewardDefinition.query().where({ streamerId: streamer.id }).resultSize();
    const aiUpdate = await injectAuthenticated(context, owner, { method: 'POST', url: '/dashboard/ai', payload: aiPayload(streamer.id) });
    Assert.equal(aiUpdate.statusCode, 303);
    Assert.match(aiUpdate.headers.location, /notice=ai-updated/);
    const configuration = await context.models.AiFeatureConfiguration.query().findById(streamer.id);
    Assert.equal(configuration.enabled, true);
    Assert.equal(configuration.invocationCommand, 'ask');
    Assert.equal(configuration.provider, 'openai');
    Assert.equal(configuration.model, 'gpt-5');
    Assert.equal(Number(configuration.pricingPolicy.pointCost), 25);
    Assert.equal(Number(configuration.cooldownSeconds), 10);
    Assert.equal(Number(configuration.maxInputChars), 1800);
    Assert.equal(Number(configuration.timeoutMs), 4500);
    Assert.match(configuration.configurationVersion, /^[0-9a-f-]{36}$/i);
    Assert.equal(await context.models.RewardDefinition.query().where({ streamerId: streamer.id }).resultSize(), beforeRewards);

    const forbidden = await injectAuthenticated(context, viewer, { method: 'POST', url: '/dashboard/ai', payload: aiPayload(streamer.id, { invocationCommand: 'viewer-change' }) });
    Assert.equal(forbidden.statusCode, 303);
    Assert.match(forbidden.headers.location, /error=forbidden/);
    Assert.equal((await context.models.AiFeatureConfiguration.query().findById(streamer.id)).invocationCommand, 'ask');

    await injectAuthenticated(context, owner, { method: 'POST', url: '/dashboard/ai/instructions', payload: { streamerId: streamer.id, action: 'create', instruction: 'Keep responses concise and relevant.' } });
    const firstDraft = await context.models.StreamerInstructionVersion.query().where({ streamerId: streamer.id }).orderBy('id', 'desc').first();
    const validated = await injectAuthenticated(context, owner, { method: 'POST', url: '/dashboard/ai/instructions', payload: { streamerId: streamer.id, action: 'validate', versionId: firstDraft.id } });
    Assert.equal(validated.statusCode, 303);
    Assert.equal((await context.models.StreamerInstructionVersion.query().findById(firstDraft.id)).status, 'approved');
    const published = await injectAuthenticated(context, owner, { method: 'POST', url: '/dashboard/ai/instructions', payload: { streamerId: streamer.id, action: 'publish', versionId: firstDraft.id } });
    Assert.equal(published.statusCode, 303);
    Assert.equal((await context.models.StreamerInstructionVersion.query().findById(firstDraft.id)).status, 'active');

    await injectAuthenticated(context, owner, { method: 'POST', url: '/dashboard/ai/instructions', payload: { streamerId: streamer.id, action: 'create', instruction: 'Always keep answers brief.' } });
    const warningDraft = await context.models.StreamerInstructionVersion.query().where({ streamerId: streamer.id }).orderBy('id', 'desc').first();
    await injectAuthenticated(context, owner, { method: 'POST', url: '/dashboard/ai/instructions', payload: { streamerId: streamer.id, action: 'validate', versionId: warningDraft.id } });
    const blockedPublish = await injectAuthenticated(context, owner, { method: 'POST', url: '/dashboard/ai/instructions', payload: { streamerId: streamer.id, action: 'publish', versionId: warningDraft.id } });
    Assert.match(blockedPublish.headers.location, /error=instruction-warnings/);
    await injectAuthenticated(context, owner, { method: 'POST', url: '/dashboard/ai/instructions', payload: { streamerId: streamer.id, action: 'acknowledge', versionId: warningDraft.id } });
    const warningPublish = await injectAuthenticated(context, owner, { method: 'POST', url: '/dashboard/ai/instructions', payload: { streamerId: streamer.id, action: 'publish', versionId: warningDraft.id } });
    Assert.equal(warningPublish.statusCode, 303);
    Assert.equal((await context.models.StreamerInstructionVersion.query().findById(warningDraft.id)).status, 'active');
    Assert.equal((await context.models.StreamerInstructionVersion.query().findById(firstDraft.id)).status, 'superseded');

    const rollback = await injectAuthenticated(context, owner, { method: 'POST', url: '/dashboard/ai/instructions', payload: { streamerId: streamer.id, action: 'rollback', versionId: firstDraft.id } });
    Assert.equal(rollback.statusCode, 303);
    Assert.match(rollback.headers.location, /notice=instruction-rolled-back/);
    const active = await context.models.StreamerInstructionVersion.query().findOne({ streamerId: streamer.id, status: 'active' }).orderBy('id', 'desc');
    Assert.equal(active.instruction, 'Keep responses concise and relevant.');
});
