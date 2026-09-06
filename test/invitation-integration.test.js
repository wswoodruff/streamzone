'use strict';

const Assert = require('node:assert/strict');
const Test = require('node:test');
let Knex;
let Model;
try {
    Knex = require('knex');
    ({ Model } = require('objection'));
}
catch {
    // Production database dependencies are optional in stripped-down test environments.
}

if (!Knex) {
    Test('invitation integration assertions (database dependencies unavailable)', { skip: true }, () => {});
}
else {
    const migrations = [1, 2, 3, 4, 5, 6].map((number) => require(`../migrations/00${number}-${[
        'create-streaming-tables', 'create-auth-tables', 'create-command-tables', 'rename-model-tables',
        'create-streamer-memberships', 'create-streamer-invitations'
    ][number - 1]}`));
    const User = require('../lib/models/user');
    const Streamer = require('../lib/models/streamer');
    const StreamerMembership = require('../lib/models/streamer-membership');
    const StreamerInvitation = require('../lib/models/streamer-invitation');
    const AuthorizationService = require('../lib/services/authorization-service');
    const InvitationService = require('../lib/services/invitation-service');

    Test('invitations are hashed, unique, expiring, revocable, email-bound, and transactionally accepted', async (t) => {
        const knex = Knex({ client: 'better-sqlite3', connection: { filename: ':memory:' }, useNullAsDefault: true });
        t.after(async () => { Model.knex(null); await knex.destroy(); });
        for (const migration of migrations) await migration.up(knex);
        Model.knex(knex);

        const owner = await User.query().insert({ email: 'owner@example.com', displayName: 'Owner', passwordHash: 'x' });
        const invitee = await User.query().insert({ email: 'person@example.com', displayName: 'Person', passwordHash: 'x' });
        const other = await User.query().insert({ email: 'other@example.com', displayName: 'Other', passwordHash: 'x' });
        const streamer = await Streamer.query().insert({ slug: 'integration', displayName: 'Integration' });
        await StreamerMembership.query().insert({ userId: owner.id, streamerId: streamer.id, role: 'owner' });
        const authorizationService = new AuthorizationService();
        const invitationService = new InvitationService();
        const models = () => ({ User, Streamer, StreamerMembership, StreamerInvitation });
        const services = () => ({ authorizationService, invitationService });
        authorizationService.server = { models, services };
        invitationService.server = { models, services };

        const created = await invitationService.create(owner.id, streamer.id, { email: ' PERSON@Example.COM ', role: 'editor' });
        const stored = await StreamerInvitation.query().findById(created.invitation.id);
        Assert.equal(stored.inviteeEmail, 'person@example.com');
        Assert.notEqual(stored.tokenHash, created.token);
        Assert.equal(stored.tokenHash, invitationService.digestToken(created.token));
        Assert.equal(JSON.stringify(stored).includes(stored.tokenHash), false);
        await Assert.rejects(invitationService.create(owner.id, streamer.id, { email: 'person@example.com', role: 'viewer' }), { code: 'CONFLICT' });
        await Assert.rejects(invitationService.accept(other.id, created.token), { code: 'FORBIDDEN' });
        const membership = await invitationService.accept(invitee.id, created.token);
        Assert.equal(membership.role, 'editor');
        await Assert.rejects(invitationService.accept(invitee.id, created.token), { code: 'INVITATION_USED' });
        Assert.equal(await StreamerMembership.query().where({ userId: invitee.id, streamerId: streamer.id }).resultSize(), 1);

        const revoked = await invitationService.create(owner.id, streamer.id, { email: 'other@example.com', role: 'viewer' });
        await invitationService.revoke(owner.id, streamer.id, revoked.invitation.id);
        await Assert.rejects(invitationService.accept(other.id, revoked.token), { code: 'INVITATION_REVOKED' });
        const expired = await invitationService.create(owner.id, streamer.id, { email: 'expired@example.com', role: 'viewer' });
        await StreamerInvitation.query().patchAndFetchById(expired.invitation.id, { expiresAt: new Date(0).toISOString() });
        await Assert.rejects(invitationService.accept(other.id, expired.token), { code: 'INVITATION_EXPIRED' });
    });

    Test('authority ordering and final-owner protection cover memberships and invitations', async () => {
        const authorization = new AuthorizationService();
        Assert.throws(() => authorization.assertCanManageRole('admin', 'admin'), { code: 'FORBIDDEN' });
        Assert.throws(() => authorization.assertCanManageRole('admin', 'owner'), { code: 'FORBIDDEN' });
        Assert.doesNotThrow(() => authorization.assertCanManageRole('owner', 'owner'));
        const model = { query: () => ({ where: () => ({ forUpdate: async () => [{ role: 'owner' }] }) }) };
        await Assert.rejects(authorization.assertOwnerRemains(model, {}, 1, 'owner', null), { code: 'FINAL_OWNER' });
    });
}
