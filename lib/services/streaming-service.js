'use strict';

const Schmervice = require('@hapipal/schmervice');
const { ResourceNotFoundError } = require('./authorization-service');

module.exports = class StreamingService extends Schmervice.Service {
    authorization() {
        return this.server.services().authorizationService;
    }

    listPublicStreamers() {
        const { Streamer } = this.server.models();
        return Streamer.query().withGraphFetched('sources').orderBy('displayName');
    }

    listPublicStreams(status) {
        const { Stream } = this.server.models();
        const query = Stream.query().withGraphFetched('source.streamer').orderBy('createdAt', 'desc');
        return status ? query.where('status', status) : query;
    }

    async listManagedStreamers(userId, capability) {
        const { Streamer } = this.server.models();
        return Streamer.query()
            .joinRelated('memberships')
            .where('memberships.userId', userId)
            .whereIn('memberships.role', this.authorization().rolesForCapability(capability))
            .withGraphFetched('sources.streams')
            .orderBy('displayName');
    }

    async listManagedStreams(userId, capability) {
        const { Stream } = this.server.models();
        return Stream.query()
            .joinRelated('source.streamer.memberships')
            .where('source:streamer:memberships.userId', userId)
            .whereIn('source:streamer:memberships.role', this.authorization().rolesForCapability(capability))
            .withGraphFetched('source.streamer')
            .orderBy('createdAt', 'desc');
    }

    async createStreamer(userId, streamer) {
        const { Streamer, StreamerMembership } = this.server.models();
        return Streamer.transaction(async (transaction) => {
            const created = await Streamer.query(transaction).insert(streamer);
            const membership = await StreamerMembership.query(transaction).insert({ userId, streamerId: created.id, role: 'owner' });
            return { streamer: created, membership };
        });
    }

    async updateStreamer(userId, streamerId, capability, changes) {
        await this.authorization().requireCapability(userId, streamerId, capability);
        const { Streamer } = this.server.models();
        return Streamer.query().patchAndFetchById(streamerId, changes);
    }

    async deleteStreamer(userId, streamerId, capability) {
        await this.authorization().requireCapability(userId, streamerId, capability);
        const { Streamer } = this.server.models();
        return Streamer.query().deleteById(streamerId);
    }

    async listCommands(userId, streamerId, capability, { includeDisabled = false } = {}) {
        await this.authorization().requireCapability(userId, streamerId, capability);
        const { Command } = this.server.models();
        const query = Command.query().where({ streamerId }).orderBy('name');
        return includeDisabled ? query : query.where({ enabled: true });
    }

    async createCommand(userId, streamerId, capability, command) {
        await this.authorization().requireCapability(userId, streamerId, capability);
        const { Command } = this.server.models();
        return Command.query().insert({ ...command, name: command.name.toLowerCase(), streamerId });
    }

    async updateCommand(userId, streamerId, commandId, capability, changes) {
        await this.authorization().requireCommandCapability(userId, streamerId, commandId, capability);
        const { Command } = this.server.models();
        const normalized = changes.name ? { ...changes, name: changes.name.toLowerCase() } : changes;
        return Command.query().where({ id: commandId, streamerId }).patch(normalized).returning('*').first();
    }

    async deleteCommand(userId, streamerId, commandId, capability) {
        await this.authorization().requireCommandCapability(userId, streamerId, commandId, capability);
        const { Command } = this.server.models();
        return Command.query().delete().where({ id: commandId, streamerId });
    }

    async addSource(userId, streamerId, capability, source) {
        await this.authorization().requireCapability(userId, streamerId, capability);
        const { Source } = this.server.models();
        return Source.query().insert({ ...source, streamerId });
    }

    async createStream(userId, capability, stream) {
        await this.authorization().requireSourceCapability(userId, stream.sourceId, capability);
        const { Stream } = this.server.models();
        return Stream.query().insert(stream);
    }

    async updateStream(userId, streamId, capability, changes) {
        const { Stream, Source } = this.server.models();
        return Stream.transaction(async (transaction) => {
            const stream = await this.authorization().requireStreamCapability(userId, streamId, capability, transaction);

            if (changes.sourceId && changes.sourceId !== stream.sourceId) {
                const target = await Source.query(transaction).findById(changes.sourceId);

                // A stream belongs to the tenant of its source.  Even a user who is
                // a member of both tenants must not use an update as a tenant move.
                if (!target || target.streamerId !== stream.source.streamerId) {
                    throw new ResourceNotFoundError('Stream');
                }
            }

            return Stream.query(transaction).patchAndFetchById(streamId, changes);
        });
    }

    async deleteStream(userId, streamId, capability) {
        await this.authorization().requireStreamCapability(userId, streamId, capability);
        const { Stream } = this.server.models();
        return Stream.query().deleteById(streamId);
    }
};
