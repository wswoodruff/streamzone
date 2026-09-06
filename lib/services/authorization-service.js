'use strict';

const Schmervice = require('@hapipal/schmervice');

const capabilities = Object.freeze({
    owner: Object.freeze([
        'readManagement', 'manageSources', 'manageStreams', 'manageCommands',
        'manageMemberships', 'deleteStreamer', 'transferOwnership'
    ]),
    admin: Object.freeze([
        'readManagement', 'manageSources', 'manageStreams', 'manageCommands', 'manageMemberships'
    ]),
    editor: Object.freeze(['readManagement', 'manageSources', 'manageStreams', 'manageCommands']),
    viewer: Object.freeze(['readManagement'])
});

class AuthorizationError extends Error {
    constructor(message, code = 'FORBIDDEN') {
        super(message);
        this.name = 'AuthorizationError';
        this.code = code;
    }
}

module.exports = class AuthorizationService extends Schmervice.Service {
    can(role, capability) {
        return capabilities[role]?.includes(capability) || false;
    }

    async roleFor(userId, streamerId, transaction) {
        const { StreamerMembership } = this.server.models();
        const membership = await StreamerMembership.query(transaction).findOne({ userId, streamerId });

        return membership?.role || null;
    }

    async isAllowed(userId, streamerId, capability, transaction) {
        return this.can(await this.roleFor(userId, streamerId, transaction), capability);
    }

    async requireCapability(userId, streamerId, capability, transaction) {
        const role = await this.roleFor(userId, streamerId, transaction);

        if (!this.can(role, capability)) {
            throw new AuthorizationError(`The ${capability} capability is required.`);
        }

        return role;
    }

    async addMembership(actorUserId, streamerId, membership) {
        const { StreamerMembership } = this.server.models();

        return StreamerMembership.transaction(async (transaction) => {
            const actorRole = await this.requireCapability(actorUserId, streamerId, 'manageMemberships', transaction);
            this.assertCanManageRole(actorRole, membership.role);

            return StreamerMembership.query(transaction).insert({
                userId: membership.userId,
                streamerId,
                role: membership.role
            });
        });
    }

    async updateMembership(actorUserId, streamerId, userId, role) {
        const { StreamerMembership } = this.server.models();

        return StreamerMembership.transaction(async (transaction) => {
            const actorRole = await this.requireCapability(actorUserId, streamerId, 'manageMemberships', transaction);
            const current = await this.findMembershipForUpdate(StreamerMembership, transaction, userId, streamerId);

            if (!current) {
                return null;
            }

            this.assertCanManageRole(actorRole, current.role);
            this.assertCanManageRole(actorRole, role);
            await this.assertOwnerRemains(StreamerMembership, transaction, streamerId, current.role, role);

            return StreamerMembership.query(transaction)
                .where({ userId, streamerId })
                .patch({ role, updatedAt: new Date().toISOString() })
                .returning('*')
                .first();
        });
    }

    async removeMembership(actorUserId, streamerId, userId) {
        const { StreamerMembership } = this.server.models();

        return StreamerMembership.transaction(async (transaction) => {
            const actorRole = await this.requireCapability(actorUserId, streamerId, 'manageMemberships', transaction);
            const current = await this.findMembershipForUpdate(StreamerMembership, transaction, userId, streamerId);

            if (!current) {
                return 0;
            }

            this.assertCanManageRole(actorRole, current.role);
            await this.assertOwnerRemains(StreamerMembership, transaction, streamerId, current.role, null);

            return StreamerMembership.query(transaction).delete().where({ userId, streamerId });
        });
    }

    async transferOwnership(actorUserId, streamerId, newOwnerUserId) {
        const { StreamerMembership } = this.server.models();

        return StreamerMembership.transaction(async (transaction) => {
            const actorRole = await this.requireCapability(actorUserId, streamerId, 'transferOwnership', transaction);
            const target = await this.findMembershipForUpdate(StreamerMembership, transaction, newOwnerUserId, streamerId);

            if (!target) {
                throw new AuthorizationError('The new owner must already be a member.', 'MEMBERSHIP_NOT_FOUND');
            }

            if (actorUserId === newOwnerUserId) {
                return target;
            }

            this.assertCanManageRole(actorRole, target.role);
            const now = new Date().toISOString();
            await StreamerMembership.query(transaction).where({ userId: newOwnerUserId, streamerId }).patch({ role: 'owner', updatedAt: now });
            await StreamerMembership.query(transaction).where({ userId: actorUserId, streamerId }).patch({ role: 'admin', updatedAt: now });

            return StreamerMembership.query(transaction).findOne({ userId: newOwnerUserId, streamerId });
        });
    }

    assertCanManageRole(actorRole, subjectRole) {
        if (actorRole !== 'owner' && subjectRole === 'owner') {
            throw new AuthorizationError('Only an owner can manage owner memberships.');
        }
    }

    async findMembershipForUpdate(Model, transaction, userId, streamerId) {
        return Model.query(transaction).where({ userId, streamerId }).forUpdate().first();
    }

    async assertOwnerRemains(Model, transaction, streamerId, currentRole, nextRole) {
        if (currentRole !== 'owner' || nextRole === 'owner') {
            return;
        }

        // Lock all owner rows before checking the invariant so concurrent changes serialize.
        const owners = await Model.query(transaction).where({ streamerId, role: 'owner' }).forUpdate();

        if (owners.length <= 1) {
            throw new AuthorizationError('A streamer must retain at least one owner.', 'FINAL_OWNER');
        }
    }
};

module.exports.AuthorizationError = AuthorizationError;
module.exports.capabilities = capabilities;
