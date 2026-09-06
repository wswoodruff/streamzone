'use strict';

const Crypto = require('node:crypto');
const Schmervice = require('@hapipal/schmervice');
const { AuthorizationError, ResourceNotFoundError } = require('./authorization-service');

const DEFAULT_LIFETIME = 7 * 24 * 60 * 60 * 1000;

class InvitationError extends Error {
    constructor(message, code) {
        super(message);
        this.name = 'InvitationError';
        this.code = code;
    }
}

module.exports = class InvitationService extends Schmervice.Service {
    normalizeEmail(email) { return email.trim().toLowerCase(); }
    digestToken(token) { return Crypto.createHash('sha256').update(token).digest('hex'); }

    async listMemberships(actorId, streamerId) {
        const { StreamerMembership } = this.server.models();
        await this.server.services().authorizationService.requireCapability(actorId, streamerId, 'manageMemberships');
        return StreamerMembership.query().where({ streamerId }).withGraphFetched('user').orderBy('createdAt');
    }

    updateMembership(actorId, streamerId, userId, role) {
        return this.server.services().authorizationService.updateMembership(actorId, streamerId, userId, role);
    }

    removeMembership(actorId, streamerId, userId) {
        return this.server.services().authorizationService.removeMembership(actorId, streamerId, userId);
    }

    async create(actorId, streamerId, { email, role, expiresAt }) {
        const { StreamerInvitation } = this.server.models();
        const authorization = this.server.services().authorizationService;
        const inviteeEmail = this.normalizeEmail(email);
        const expiration = expiresAt ? new Date(expiresAt) : new Date(Date.now() + DEFAULT_LIFETIME);
        if (expiration <= new Date()) throw new InvitationError('Expiration must be in the future.', 'INVALID_INVITATION');

        return StreamerInvitation.transaction(async (transaction) => {
            const actorRole = await authorization.requireCapability(actorId, streamerId, 'manageMemberships', transaction);
            authorization.assertCanManageRole(actorRole, role);
            const outstanding = await StreamerInvitation.query(transaction).findOne({ streamerId, inviteeEmail, acceptedAt: null, revokedAt: null });
            if (outstanding && new Date(outstanding.expiresAt) > new Date()) {
                throw new InvitationError('An active invitation already exists for this email.', 'CONFLICT');
            }
            if (outstanding) {
                await StreamerInvitation.query(transaction).patchAndFetchById(outstanding.id, { revokedAt: new Date().toISOString() });
            }
            const token = Crypto.randomBytes(32).toString('base64url');
            const invitation = await StreamerInvitation.query(transaction).insert({
                streamerId, inviteeEmail, role, inviterUserId: actorId,
                tokenHash: this.digestToken(token), expiresAt: expiration.toISOString()
            });
            return { invitation, token };
        });
    }

    async list(actorId, streamerId) {
        const { StreamerInvitation } = this.server.models();
        await this.server.services().authorizationService.requireCapability(actorId, streamerId, 'manageMemberships');
        return StreamerInvitation.query().where({ streamerId }).withGraphFetched('inviter').orderBy('createdAt', 'desc');
    }

    async revoke(actorId, streamerId, invitationId) {
        const { StreamerInvitation } = this.server.models();
        const authorization = this.server.services().authorizationService;
        return StreamerInvitation.transaction(async (transaction) => {
            const actorRole = await authorization.requireCapability(actorId, streamerId, 'manageMemberships', transaction);
            const invitation = await StreamerInvitation.query(transaction).where({ id: invitationId, streamerId }).forUpdate().first();
            if (!invitation) throw new ResourceNotFoundError('Invitation');
            authorization.assertCanManageRole(actorRole, invitation.role);
            if (invitation.acceptedAt) throw new InvitationError('The invitation has already been used.', 'INVITATION_USED');
            if (!invitation.revokedAt) await StreamerInvitation.query(transaction).patchAndFetchById(invitation.id, { revokedAt: new Date().toISOString() });
            return true;
        });
    }

    async accept(userId, plaintextToken) {
        const { StreamerInvitation, StreamerMembership, User } = this.server.models();
        const tokenHash = this.digestToken(plaintextToken);
        return StreamerInvitation.transaction(async (transaction) => {
            const invitation = await StreamerInvitation.query(transaction).where({ tokenHash }).forUpdate().first();
            if (!invitation) throw new InvitationError('Invitation is invalid.', 'INVALID_INVITATION');
            if (invitation.revokedAt) throw new InvitationError('Invitation has been revoked.', 'INVITATION_REVOKED');
            if (invitation.acceptedAt) throw new InvitationError('Invitation has already been used.', 'INVITATION_USED');
            if (new Date(invitation.expiresAt) <= new Date()) throw new InvitationError('Invitation has expired.', 'INVITATION_EXPIRED');
            const user = await User.query(transaction).findById(userId);
            if (!user || this.normalizeEmail(user.email) !== invitation.inviteeEmail) {
                throw new AuthorizationError('This invitation belongs to another email address.');
            }
            let membership = await StreamerMembership.query(transaction).findOne({ userId, streamerId: invitation.streamerId });
            if (!membership) membership = await StreamerMembership.query(transaction).insert({ userId, streamerId: invitation.streamerId, role: invitation.role });
            await StreamerInvitation.query(transaction).patchAndFetchById(invitation.id, { acceptedAt: new Date().toISOString() });
            return membership;
        });
    }
};

module.exports.InvitationError = InvitationError;
