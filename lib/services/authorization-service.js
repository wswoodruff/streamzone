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

class ResourceNotFoundError extends Error {
    constructor(resource = 'Resource') {
        super(`${resource} not found`);
        this.name = 'ResourceNotFoundError';
        this.code = 'NOT_FOUND';
    }
}

module.exports = class AuthorizationService extends Schmervice.Service {
    can(role, capability) {
        return capabilities[role]?.includes(capability) || false;
    }

    rolesForCapability(capability) {
        return Object.keys(capabilities).filter((role) => this.can(role, capability));
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
        if (!role) {
            throw new ResourceNotFoundError('Streamer');
        }
        if (!this.can(role, capability)) {
            throw new AuthorizationError(`The ${capability} capability is required.`);
        }
        return role;
    }

    async requireCommandCapability(userId, streamerId, commandId, capability, transaction) {
        const { Command } = this.server.models();
        const role = await this.roleFor(userId, streamerId, transaction);
        if (!role) {
            throw new ResourceNotFoundError('Command');
        }
        const command = await Command.query(transaction).findOne({ id: commandId, streamerId });
        if (!command) {
            throw new ResourceNotFoundError('Command');
        }
        if (!this.can(role, capability)) {
            throw new AuthorizationError(`The ${capability} capability is required.`);
        }
        return command;
    }

    async requireSourceCapability(userId, sourceId, capability, transaction) {
        const { Source } = this.server.models();
        const source = await Source.query(transaction).findById(sourceId);
        if (!source) {
            throw new ResourceNotFoundError('Source');
        }
        await this.requireCapabilityForChild(userId, source.streamerId, capability, 'Source', transaction);
        return source;
    }

    async requireStreamCapability(userId, streamId, capability, transaction) {
        const { Stream } = this.server.models();
        const stream = await Stream.query(transaction).findById(streamId).withGraphFetched('source');
        if (!stream?.source) {
            throw new ResourceNotFoundError('Stream');
        }
        await this.requireCapabilityForChild(userId, stream.source.streamerId, capability, 'Stream', transaction);
        return stream;
    }

    async requireCapabilityForChild(userId, streamerId, capability, resource, transaction) {
        const role = await this.roleFor(userId, streamerId, transaction);
        if (!role) {
            throw new ResourceNotFoundError(resource);
        }
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
            return StreamerMembership.query(transaction).insert({ userId: membership.userId, streamerId, role: membership.role });
        });
    }

    async updateMembership(actorUserId, streamerId, userId, role) {
        const { StreamerMembership } = this.server.models();
        return StreamerMembership.transaction(async (transaction) => {
            const actorRole = await this.requireCapability(actorUserId, streamerId, 'manageMemberships', transaction);
            const current = await this.findMembershipForUpdate(StreamerMembership, transaction, userId, streamerId);
            if (!current) return null;
            this.assertCanManageRole(actorRole, current.role);
            this.assertCanManageRole(actorRole, role);
            await this.assertOwnerRemains(StreamerMembership, transaction, streamerId, current.role, role);
            return StreamerMembership.query(transaction).where({ userId, streamerId }).patch({ role, updatedAt: new Date().toISOString() }).returning('*').first();
        });
    }

    async removeMembership(actorUserId, streamerId, userId) {
        const { StreamerMembership } = this.server.models();
        return StreamerMembership.transaction(async (transaction) => {
            const actorRole = await this.requireCapability(actorUserId, streamerId, 'manageMemberships', transaction);
            const current = await this.findMembershipForUpdate(StreamerMembership, transaction, userId, streamerId);
            if (!current) return 0;
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
            if (!target) throw new AuthorizationError('The new owner must already be a member.', 'MEMBERSHIP_NOT_FOUND');
            if (actorUserId === newOwnerUserId) return target;
            this.assertCanManageRole(actorRole, target.role);
            const now = new Date().toISOString();
            await StreamerMembership.query(transaction).where({ userId: newOwnerUserId, streamerId }).patch({ role: 'owner', updatedAt: now });
            await StreamerMembership.query(transaction).where({ userId: actorUserId, streamerId }).patch({ role: 'admin', updatedAt: now });
            return StreamerMembership.query(transaction).findOne({ userId: newOwnerUserId, streamerId });
        });
    }

    assertCanManageRole(actorRole, subjectRole) {
        if (actorRole !== 'owner' && subjectRole === 'owner') throw new AuthorizationError('Only an owner can manage owner memberships.');
    }

    async findMembershipForUpdate(Model, transaction, userId, streamerId) {
        return Model.query(transaction).where({ userId, streamerId }).forUpdate().first();
    }

    async assertOwnerRemains(Model, transaction, streamerId, currentRole, nextRole) {
        if (currentRole !== 'owner' || nextRole === 'owner') return;
        const owners = await Model.query(transaction).where({ streamerId, role: 'owner' }).forUpdate();
        if (owners.length <= 1) throw new AuthorizationError('A streamer must retain at least one owner.', 'FINAL_OWNER');
    }
};

module.exports.AuthorizationError = AuthorizationError;
module.exports.ResourceNotFoundError = ResourceNotFoundError;
module.exports.capabilities = capabilities;
