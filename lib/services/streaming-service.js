'use strict';

const Schmervice = require('@hapipal/schmervice');
const { ResourceNotFoundError } = require('./authorization-service');

class InvalidSessionLifecycleError extends Error {
    constructor(message) {
        super(message);
        this.name = 'InvalidSessionLifecycleError';
        this.code = 'INVALID_SESSION_LIFECYCLE';
    }
}

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
        const { Stream, StreamSession } = this.server.models();
        return Stream.transaction(async (transaction) => {
            const source = await this.authorization().requireSourceCapability(userId, stream.sourceId, capability, transaction);
            if (stream.streamSessionId) {
                await this.requireSessionTenant(StreamSession, stream.streamSessionId, source.streamerId, transaction);
            }
            const created = await Stream.query(transaction).insert(stream);
            if (created.streamSessionId) await this.reconcileStreamSession(created.streamSessionId, transaction);
            return created;
        });
    }

    async updateStream(userId, streamId, capability, changes) {
        const { Stream, Source, StreamSession } = this.server.models();
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

            if (changes.streamSessionId) {
                await this.requireSessionTenant(StreamSession, changes.streamSessionId, stream.source.streamerId, transaction);
            }

            const previousSessionId = stream.streamSessionId;
            const updated = await Stream.query(transaction).patchAndFetchById(streamId, changes);
            for (const sessionId of new Set([previousSessionId, updated.streamSessionId].filter(Boolean))) {
                await this.reconcileStreamSession(sessionId, transaction);
            }
            return updated;
        });
    }

    async deleteStream(userId, streamId, capability) {
        const { Stream } = this.server.models();
        return Stream.transaction(async (transaction) => {
            const stream = await this.authorization().requireStreamCapability(userId, streamId, capability, transaction);
            const deleted = await Stream.query(transaction).deleteById(streamId);
            if (stream.streamSessionId) await this.reconcileStreamSession(stream.streamSessionId, transaction);
            return deleted;
        });
    }

    async listStreamSessions(userId, streamerId, capability) {
        await this.authorization().requireCapability(userId, streamerId, capability);
        const { StreamSession } = this.server.models();
        return StreamSession.query().where({ streamerId }).withGraphFetched('streams.source').orderBy('createdAt', 'desc');
    }

    async createStreamSession(userId, streamerId, capability, session) {
        await this.authorization().requireCapability(userId, streamerId, capability);
        const { StreamSession } = this.server.models();
        const record = { status: 'scheduled', ...session, streamerId };
        this.assertSessionLifecycle(record);
        return StreamSession.query().insert(record);
    }

    async updateStreamSession(userId, streamerId, sessionId, capability, changes) {
        await this.authorization().requireCapability(userId, streamerId, capability);
        const { StreamSession } = this.server.models();
        return StreamSession.transaction(async (transaction) => {
            const session = await this.requireSessionTenant(StreamSession, sessionId, streamerId, transaction);
            const next = { ...session, ...changes };
            this.assertSessionTransition(session.status, next.status);
            this.assertSessionLifecycle(next);
            return StreamSession.query(transaction).patchAndFetchById(sessionId, { ...changes, updatedAt: new Date().toISOString() });
        });
    }

    async attachStreamToSession(userId, streamerId, sessionId, streamId, capability) {
        await this.authorization().requireCapability(userId, streamerId, capability);
        const { Stream, StreamSession } = this.server.models();
        return Stream.transaction(async (transaction) => {
            await this.requireSessionTenant(StreamSession, sessionId, streamerId, transaction);
            const stream = await Stream.query(transaction).findById(streamId).withGraphFetched('source');
            if (!stream?.source || stream.source.streamerId !== streamerId) throw new ResourceNotFoundError('Stream');
            if (stream.streamSessionId && stream.streamSessionId !== sessionId) {
                throw new InvalidSessionLifecycleError('A provider occurrence is already attached to another session.');
            }
            await Stream.query(transaction).patchAndFetchById(streamId, { streamSessionId: sessionId });
            return this.reconcileStreamSession(sessionId, transaction);
        });
    }

    async reconcileStreamSession(sessionId, transaction) {
        const { Stream, StreamSession } = this.server.models();
        const session = await StreamSession.query(transaction).findById(sessionId);
        if (!session) throw new ResourceNotFoundError('StreamSession');
        const streams = await Stream.query(transaction).where({ streamSessionId: sessionId });
        if (!streams.length) return session;

        let status = 'scheduled';
        if (streams.some((stream) => stream.status === 'live')) status = 'live';
        else if (streams.every((stream) => stream.status === 'offline')) status = 'ended';
        // Provider events may arrive late or out of order. Session lifecycle is
        // forward-only even when an occurrence temporarily reports stale state.
        if (session.status === 'ended') status = 'ended';
        if (session.status === 'live' && status === 'scheduled') status = 'live';

        const starts = streams.map((stream) => stream.startedAt).filter(Boolean).map((value) => new Date(value));
        const ends = streams.map((stream) => stream.endedAt).filter(Boolean).map((value) => new Date(value));
        const changes = { status, updatedAt: new Date().toISOString() };
        if (status !== 'scheduled' && !session.startedAt) {
            const observedStarts = starts.length ? starts : ends;
            changes.startedAt = observedStarts.length ? new Date(Math.min(...observedStarts)).toISOString() : changes.updatedAt;
        }
        if (status === 'ended' && !session.endedAt) {
            changes.endedAt = ends.length ? new Date(Math.max(...ends)).toISOString() : changes.updatedAt;
        }
        if (status !== 'ended') changes.endedAt = null;
        return StreamSession.query(transaction).patchAndFetchById(sessionId, changes);
    }

    async requireSessionTenant(StreamSession, sessionId, streamerId, transaction) {
        const session = await StreamSession.query(transaction).findOne({ id: sessionId, streamerId });
        if (!session) throw new ResourceNotFoundError('StreamSession');
        return session;
    }

    assertSessionTransition(previous, next) {
        const allowed = { scheduled: ['scheduled', 'live', 'ended'], live: ['live', 'ended'], ended: ['ended'] };
        if (!allowed[previous]?.includes(next)) {
            throw new InvalidSessionLifecycleError(`A stream session cannot transition from ${previous} to ${next}.`);
        }
    }

    assertSessionLifecycle(session) {
        const started = session.startedAt && new Date(session.startedAt);
        const ended = session.endedAt && new Date(session.endedAt);
        if (session.status === 'scheduled' && (started || ended)) {
            throw new InvalidSessionLifecycleError('A scheduled session cannot have start or end timestamps.');
        }
        if (session.status === 'live' && (!started || ended)) {
            throw new InvalidSessionLifecycleError('A live session requires a start timestamp and cannot have an end timestamp.');
        }
        if (session.status === 'ended' && (!started || !ended || ended < started)) {
            throw new InvalidSessionLifecycleError('An ended session requires ordered start and end timestamps.');
        }
    }
};

module.exports.InvalidSessionLifecycleError = InvalidSessionLifecycleError;
