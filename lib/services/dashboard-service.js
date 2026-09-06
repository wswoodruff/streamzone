'use strict';

const Schmervice = require('@hapipal/schmervice');
const { ResourceNotFoundError } = require('./authorization-service');

const providerNames = Object.freeze({
    twitch: 'Twitch',
    youtube: 'YouTube'
});

const titleCase = (value) => value ? value.charAt(0).toUpperCase() + value.slice(1) : '';
const providerName = (provider) => providerNames[provider] || titleCase(provider);
const unique = (values) => [...new Set(values.filter(Boolean))];
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

const sessionTone = (status) => status === 'live' ? 'live' : status === 'scheduled' ? 'scheduled' : 'neutral';

module.exports = class DashboardService extends Schmervice.Service {
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
        const permissions = this.permissions(authorization, role);
        const { EarningPolicy, PointAccount } = this.server.models();

        const teamPromise = permissions.manageMemberships ?
            services.invitationService.listMemberships(userId, current.id) :
            Promise.resolve(null);

        const [sessions, commands, rewards, aiConfiguration, earningPolicies, pointTotals, teamMembers] = await Promise.all([
            services.streamingService.listStreamSessions(userId, current.id, 'readManagement'),
            services.streamingService.listCommands(userId, current.id, 'readManagement', { includeDisabled: true }),
            services.rewardService.listManagedRewards(userId, current.id),
            services.aiFeatureService.configuration(current.id),
            EarningPolicy.query().where({ streamerId: current.id }).orderBy('name'),
            PointAccount.query()
                .where({ streamerId: current.id })
                .count({ participantCount: 'id' })
                .sum({
                    availableBalance: 'availableBalance',
                    lifetimeEarned: 'lifetimeEarned',
                    lifetimeSpent: 'lifetimeSpent'
                })
                .first(),
            teamPromise
        ]);

        const sources = (current.sources || []).map((source) => ({
            id: source.id,
            provider: source.provider,
            providerName: providerName(source.provider),
            channelId: source.channelId,
            enabled: source.enabled,
            statusLabel: source.enabled ? 'Enabled' : 'Disabled'
        }));
        const currentSession = this.currentSession(sessions);
        const commandPreview = commands.slice(0, 5).map((command) => ({
            id: command.id,
            name: command.name,
            enabled: command.enabled,
            statusLabel: command.enabled ? 'Enabled' : 'Disabled',
            roleLabel: titleCase(command.requiredChatRole),
            cooldownLabel: command.cooldownSeconds ? `${command.cooldownSeconds}s ${command.cooldownScope}` : 'No cooldown'
        }));
        const rewardPreview = rewards.slice(0, 4).map((reward) => ({
            id: reward.id,
            name: reward.name,
            pointCost: reward.pointCost,
            enabled: reward.enabled,
            statusLabel: reward.enabled ? 'Enabled' : 'Disabled',
            fulfillmentLabel: reward.fulfillmentType === 'deterministicBot' ? 'Bot fulfilled' : 'Manual'
        }));
        const policyPreview = earningPolicies.slice(0, 3).map((policy) => ({
            id: policy.id,
            name: policy.name,
            points: policy.points,
            enabled: policy.enabled,
            statusLabel: policy.enabled ? 'Enabled' : 'Disabled'
        }));
        const team = this.team(teamMembers, permissions.manageMemberships);
        const points = {
            participantCount: Number(pointTotals?.participantCount || 0),
            availableBalance: Number(pointTotals?.availableBalance || 0),
            lifetimeEarned: Number(pointTotals?.lifetimeEarned || 0),
            lifetimeSpent: Number(pointTotals?.lifetimeSpent || 0),
            policyCount: earningPolicies.length,
            enabledPolicyCount: earningPolicies.filter((policy) => policy.enabled).length,
            policies: policyPreview,
            hiddenPolicyCount: Math.max(0, earningPolicies.length - policyPreview.length)
        };
        const commandSummary = {
            total: commands.length,
            enabled: commands.filter((command) => command.enabled).length,
            disabled: commands.filter((command) => !command.enabled).length,
            items: commandPreview,
            hiddenCount: Math.max(0, commands.length - commandPreview.length)
        };
        const rewardSummary = {
            total: rewards.length,
            enabled: rewards.filter((reward) => reward.enabled).length,
            disabled: rewards.filter((reward) => !reward.enabled).length,
            items: rewardPreview,
            hiddenCount: Math.max(0, rewards.length - rewardPreview.length)
        };
        const base = `/dashboard?streamerId=${current.id}`;

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
                roleLabel: titleCase(role),
                sourceCount: sources.length,
                enabledSourceCount: sources.filter((source) => source.enabled).length
            },
            permissions,
            links: {
                overview: `${base}#overview`,
                stream: `${base}#stream`,
                sources: `${base}#sources`,
                commands: `${base}#commands`,
                team: `${base}#team`,
                rewards: `${base}#rewards`,
                ai: `${base}#ai`
            },
            currentSession,
            sources,
            commands: commandSummary,
            team,
            rewards: rewardSummary,
            points,
            ai: this.ai(aiConfiguration)
        };
    }

    permissions(authorization, role) {
        return {
            manageSources: authorization.can(role, 'manageSources'),
            manageStreams: authorization.can(role, 'manageStreams'),
            manageCommands: authorization.can(role, 'manageCommands'),
            manageMemberships: authorization.can(role, 'manageMemberships'),
            manageRewards: authorization.can(role, 'manageRewards'),
            editAiInstructions: authorization.can(role, 'editAiInstructions'),
            publishAiInstructions: authorization.can(role, 'publishAiInstructions')
        };
    }

    currentSession(sessions) {
        const session = sessions.find((candidate) => candidate.status === 'live') ||
            sessions.find((candidate) => candidate.status === 'scheduled') ||
            sessions[0];
        if (!session) return null;

        const streams = session.streams || [];
        const providers = unique(streams.map((stream) => providerName(stream.source?.provider)));
        return {
            id: session.id,
            title: session.title,
            status: session.status,
            statusLabel: titleCase(session.status),
            statusTone: sessionTone(session.status),
            contextLabel: session.status === 'live' ? 'Live now' : session.status === 'scheduled' ? 'Next session' : 'Most recent session',
            timingLabel: sessionTiming(session),
            streamCount: streams.length,
            streamCountLabel: `${streams.length} provider ${streams.length === 1 ? 'broadcast' : 'broadcasts'}`,
            providers,
            hasProviders: providers.length > 0
        };
    }

    team(members, visible) {
        if (!visible) {
            return {
                restricted: true,
                total: null,
                members: []
            };
        }

        const preview = (members || []).slice(0, 5).map((membership) => ({
            userId: membership.userId,
            displayName: membership.user?.displayName || 'Unknown member',
            role: membership.role,
            roleLabel: titleCase(membership.role)
        }));
        return {
            restricted: false,
            total: (members || []).length,
            members: preview,
            hiddenCount: Math.max(0, (members || []).length - preview.length)
        };
    }

    ai(configuration) {
        if (!configuration) {
            return {
                configured: false,
                enabled: false,
                statusLabel: 'Not configured',
                statusTone: 'neutral'
            };
        }

        const ready = Boolean(configuration.enabled && configuration.provider && configuration.model);
        return {
            configured: true,
            enabled: configuration.enabled,
            ready,
            statusLabel: !configuration.enabled ? 'Disabled' : ready ? 'Enabled' : 'Needs setup',
            statusTone: !configuration.enabled ? 'neutral' : ready ? 'live' : 'warning',
            invocationCommand: `!${configuration.invocationCommand}`,
            provider: configuration.provider,
            model: configuration.model,
            pointCost: Number(configuration.pricingPolicy?.pointCost || 0)
        };
    }
};
