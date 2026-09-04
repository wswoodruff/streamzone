'use strict';

const Schmervice = require('@hapipal/schmervice');

module.exports = class StreamingService extends Schmervice.Service {
    listStreamers() {
        const { Streamer } = this.server.models();

        return Streamer.query().withGraphFetched('sources').orderBy('displayName');
    }

    createStreamer(streamer) {
        const { Streamer } = this.server.models();

        return Streamer.query().insert(streamer);
    }

    getStreamer(id) {
        const { Streamer } = this.server.models();

        return Streamer.query().findById(id).withGraphFetched('sources.streams');
    }

    updateStreamer(id, changes) {
        const { Streamer } = this.server.models();

        return Streamer.query().patchAndFetchById(id, changes);
    }

    deleteStreamer(id) {
        const { Streamer } = this.server.models();

        return Streamer.query().deleteById(id);
    }

    async listCommands(streamerId, { includeDisabled = false } = {}) {
        const { Command, Streamer } = this.server.models();
        const streamer = await Streamer.query().findById(streamerId);

        if (!streamer) {
            return null;
        }

        const query = Command.query().where({ streamerId }).orderBy('name');
        return includeDisabled ? query : query.where({ enabled: true });
    }

    async createCommand(streamerId, command) {
        const { Command, Streamer } = this.server.models();
        const streamer = await Streamer.query().findById(streamerId);

        if (!streamer) {
            return null;
        }

        return Command.query().insert({ ...command, name: command.name.toLowerCase(), streamerId });
    }

    updateCommand(streamerId, commandId, changes) {
        const { Command } = this.server.models();
        const normalized = changes.name ? { ...changes, name: changes.name.toLowerCase() } : changes;

        return Command.query().where({ id: commandId, streamerId }).patch(normalized).returning('*').first();
    }

    deleteCommand(streamerId, commandId) {
        const { Command } = this.server.models();

        return Command.query().delete().where({ id: commandId, streamerId });
    }

    async addSource(streamerId, source) {
        const { Streamer, Source } = this.server.models();
        const streamer = await Streamer.query().findById(streamerId);

        if (!streamer) {
            return null;
        }

        return Source.query().insert({ ...source, streamerId });
    }

    listStreams(status) {
        const { Stream } = this.server.models();
        const query = Stream.query().withGraphFetched('source.streamer').orderBy('createdAt', 'desc');

        return status ? query.where('status', status) : query;
    }

    async createStream(stream) {
        const { Source, Stream } = this.server.models();
        const source = await Source.query().findById(stream.sourceId);

        if (!source) {
            return null;
        }

        return Stream.query().insert(stream);
    }

    updateStream(id, changes) {
        const { Stream } = this.server.models();

        return Stream.query().patchAndFetchById(id, changes);
    }

    deleteStream(id) {
        const { Stream } = this.server.models();

        return Stream.query().deleteById(id);
    }
};
