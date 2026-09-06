'use strict';

const Schmervice = require('@hapipal/schmervice');
const { ResourceNotFoundError } = require('./authorization-service');

const providerNames = Object.freeze({
    twitch: 'Twitch',
    youtube: 'YouTube'
});

const titleCase = (value) => value ? value.charAt(0).toUpperCase() + value.slice(1) : '';
const providerName = (provider) => providerNames[provider] || titleCase(provider);
const statusTone = (status) => status === 'live' ? 'live' : status === 'scheduled' ? 'scheduled' : 'neutral';
const formatTimestamp = (value) => {
    if (!value) return null;

    return `${new Intl.DateTimeFormat('en-US', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'UTC'
    }).format(new Date(value))} UTC`;
};

const sessionTiming = (session) => {
    if (session.status === 'live' && session.startedAt) return `Live since ${formatTimestamp(session.startedAt)}`;
    if (session.status === 'scheduled' && session.scheduledAt) return `Scheduled for ${formatTimestamp(session.scheduledAt)}`;
    if (session.status === 'ended' && session.endedAt) return `Ended ${formatTimestamp(session.endedAt)}`;
    return session.status === 'scheduled' ? 'Scheduled without a start time' : 'Timing is not available';
};

const streamTiming = (stream) => {
    if (stream.status === 'live' && stream.startedAt) return `Live since ${formatTimestamp(stream.startedAt)}`;
    if (stream.status === 'offline' && stream.endedAt) return `Offline since ${formatTimestamp(stream.endedAt)}`;
    return stream.status === 'scheduled' ? 'Provider broadcast is scheduled' : 'Provider timing is not available';
};

module.exports = class StreamManagementService extends Schmervice.Service {
    async overview(userId, requestedStreamerId) {
        const services = this.server.services();
        const authorization = services.authorizationService;
        const managedStreamers = await services.streamingService.listManagedStreamers(userId, 'readManagement');

        if (!managedStreamers.length) {
            return {
                streamers: [],
                currentStreamer: null,
                hasMultipleStreamers: false
            };
        }

        const requestedId = requestedStreamerId ? Number(requestedStreamerId) : null;
        const current = requestedId ? managedStreamers.find((streamer) => streamer.id === requestedId) : managedStreamers[0];
        if (!current) throw new ResourceNotFoundError('Streamer');

        const role = await authorization.requireCapability(userId, current.id, 'readManagement');
        const sessions = await services.streamingService.listStreamSessions(userId, current.id, 'readManagement');
        const permissions = {
            manageSources: authorization.can(role, 'manageSources'),
            manageStreams: authorization.can(role, 'manageStreams')
        };

        const streams = sessions.flatMap((session) => (session.streams || []).map((stream) => ({
            id: stream.id,
            title: stream.title || 'Untitled provider broadcast',
            externalId: stream.externalId,
            externalIdLabel: stream.externalId || 'No provider broadcast ID recorded',
            status: stream.status,
            statusLabel: titleCase(stream.status),
            statusTone: statusTone(stream.status),
            timingLabel: streamTiming(stream),
            sourceId: stream.sourceId,
            sourceProviderName: providerName(stream.source?.provider),
            sourceChannelId: stream.source?.channelId || 'Unknown channel',
            streamSessionId: session.id,
            streamSessionTitle: session.title,
            createdAt: stream.createdAt
        }))).sort((left, right) => new Date(right.createdAt || 0) - new Date(left.createdAt || 0));

        const streamsBySource = streams.reduce((counts, stream) => {
            counts.set(stream.sourceId, (counts.get(stream.sourceId) || 0) + 1);
            return counts;
        }, new Map());

        const latestStreamBySource = new Map();
        for (const stream of streams) {
            if (!latestStreamBySource.has(stream.sourceId)) latestStreamBySource.set(stream.sourceId, stream);
        }

        const sources = (current.sources || []).map((source) => {
            const latestStream = latestStreamBySource.get(source.id);
            return {
                id: source.id,
                provider: source.provider,
                providerName: providerName(source.provider),
                channelId: source.channelId,
                enabled: source.enabled,
                statusLabel: source.enabled ? 'Enabled' : 'Disabled',
                streamCount: streamsBySource.get(source.id) || 0,
                latestBroadcastLabel: latestStream ? `${latestStream.statusLabel}: ${latestStream.title}` : 'No provider broadcasts yet',
                optionLabel: `${providerName(source.provider)} · ${source.channelId}`
            };
        });

        const sessionItems = sessions.map((session) => {
            const sessionStreams = session.streams || [];
            return {
                id: session.id,
                title: session.title,
                status: session.status,
                statusLabel: titleCase(session.status),
                statusTone: statusTone(session.status),
                timingLabel: sessionTiming(session),
                streamCount: sessionStreams.length,
                streamCountLabel: `${sessionStreams.length} provider ${sessionStreams.length === 1 ? 'broadcast' : 'broadcasts'}`,
                canStart: permissions.manageStreams && session.status === 'scheduled',
                canEnd: permissions.manageStreams && session.status === 'live',
                optionLabel: `${session.title} · ${titleCase(session.status)}`
            };
        });

        const base = `/dashboard?streamerId=${current.id}`;
        const managementBase = `/dashboard/stream-management?streamerId=${current.id}`;

        return {
            streamers: managedStreamers.map((streamer) => ({
                id: streamer.id,
                displayName: streamer.displayName,
                slug: streamer.slug,
                selected: streamer.id === current.id
            })),
            hasMultipleStreamers: managedStreamers.length > 1,
            currentStreamer: {
                id: current.id,
                displayName: current.displayName,
                slug: current.slug,
                role,
                roleLabel: titleCase(role)
            },
            permissions,
            links: {
                overview: `${base}#overview`,
                stream: `${managementBase}#sessions`,
                sources: `${managementBase}#sources`,
                commands: `${base}#commands`,
                team: `${base}#team`,
                rewards: `${base}#rewards`,
                ai: `${base}#ai`
            },
            sources,
            sessions: sessionItems,
            streams,
            sourceOptions: sources.filter((source) => source.enabled),
            sessionOptions: sessionItems.filter((session) => session.status !== 'ended'),
            canAttachBroadcast: permissions.manageStreams && sources.some((source) => source.enabled) && sessionItems.some((session) => session.status !== 'ended')
        };
    }
};
