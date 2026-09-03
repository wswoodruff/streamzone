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
};
