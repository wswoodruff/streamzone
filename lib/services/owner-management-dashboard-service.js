'use strict';

const Schmervice = require('@hapipal/schmervice');
const { configSchemas } = require('./reward-service');

const roleOrder = ['viewer', 'editor', 'admin', 'owner'];
const titleCase = (value) => value ? value.charAt(0).toUpperCase() + value.slice(1) : '';
const formatTimestamp = (value) => value ? `${new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC'
}).format(new Date(value))} UTC` : null;
const canManageRole = (authorization, actorRole, subjectRole) => {
    try {
        authorization.assertCanManageRole(actorRole, subjectRole);
        return true;
    }
    catch (error) {
        return false;
    }
};
const roleOptions = (authorization, actorRole, selectedRole = null) => roleOrder
    .filter((candidate) => canManageRole(authorization, actorRole, candidate))
    .map((candidate) => ({ value: candidate, label: titleCase(candidate), selected: candidate === selectedRole }));
const eligibilityOptions = (selected = 'any') => [
    ['any', 'Everyone'],
    ['member', 'Members only'],
    ['nonMember', 'Non-members only']
].map(([value, label]) => ({ value, label, selected: value === selected }));
const cooldownScopeOptions = (selected = 'participant') => ['global', 'streamer', 'session', 'participant']
    .map((value) => ({ value, label: titleCase(value), selected: value === selected }));

module.exports = class OwnerManagementDashboardService extends Schmervice.Service {
    async details(userId, streamerId) {
        const services = this.server.services();
        const authorization = services.authorizationService;
        const actorRole = await authorization.requireCapability(userId, streamerId, 'readManagement');
        const canManageMemberships = authorization.can(actorRole, 'manageMemberships');
        const canManageRewards = authorization.can(actorRole, 'manageRewards');
        const canEditAi = authorization.can(actorRole, 'editAiInstructions');
        const canPublishAi = authorization.can(actorRole, 'publishAiInstructions');
        const { EarningPolicy, PointAccount } = this.server.models();

        const teamPromise = canManageMemberships ? Promise.all([
            services.invitationService.listMemberships(userId, streamerId),
            services.invitationService.list(userId, streamerId)
        ]) : Promise.resolve([null, null]);

        const [[memberships, invitations], rewards, policies, pointTotals, aiConfiguration, instructionVersions] = await Promise.all([
            teamPromise,
            services.rewardService.listManagedRewards(userId, streamerId),
            EarningPolicy.query().where({ streamerId }).orderBy('name'),
            PointAccount.query()
                .where({ streamerId })
                .count({ participantCount: 'id' })
                .sum({
                    availableBalance: 'availableBalance',
                    lifetimeEarned: 'lifetimeEarned',
                    lifetimeSpent: 'lifetimeSpent'
                })
                .first(),
            services.aiFeatureService.configuration(streamerId),
            services.instructionService.list(userId, streamerId)
        ]);

        return {
            team: this.team(authorization, actorRole, memberships, invitations, canManageMemberships),
            rewards: this.rewards(rewards, canManageRewards),
            points: this.points(policies, pointTotals),
            ai: this.ai(aiConfiguration, canEditAi),
            instructions: this.instructions(instructionVersions, canEditAi, canPublishAi)
        };
    }

    team(authorization, actorRole, memberships, invitations, canManageMemberships) {
        const roleGuide = [
            { role: 'Viewer', summary: 'Read-only access to creator management data.' },
            { role: 'Editor', summary: 'Viewer access plus sources, streams, commands, and rewards. Can also manage AI configuration and drafts.' },
            { role: 'Admin', summary: 'Editor access plus team memberships, invitations, and AI instruction publishing.' },
            { role: 'Owner', summary: 'Admin access plus ownership transfer and streamer deletion.' }
        ];

        if (!canManageMemberships) {
            return {
                restricted: true,
                canInvite: false,
                members: [],
                invitations: [],
                roleGuide,
                actorRoleLabel: titleCase(actorRole)
            };
        }

        const members = memberships || [];
        const ownerCount = members.filter((membership) => membership.role === 'owner').length;
        const mappedMembers = members.map((membership) => {
            const manageable = canManageRole(authorization, actorRole, membership.role);
            const finalOwner = membership.role === 'owner' && ownerCount === 1;
            return {
                userId: membership.userId,
                displayName: membership.user?.displayName || 'Unknown member',
                email: membership.user?.email || '',
                role: membership.role,
                roleLabel: titleCase(membership.role),
                isFinalOwner: finalOwner,
                canUpdate: manageable && !finalOwner,
                canRemove: manageable && !finalOwner,
                roleOptions: manageable && !finalOwner ? roleOptions(authorization, actorRole, membership.role) : [],
                managementNote: finalOwner ? 'A streamer must retain at least one owner.' : !manageable ? 'Your role cannot manage this membership.' : null
            };
        });
        const now = Date.now();
        const pendingInvitations = (invitations || [])
            .filter((invitation) => !invitation.acceptedAt && !invitation.revokedAt && new Date(invitation.expiresAt).getTime() > now)
            .map((invitation) => ({
                id: invitation.id,
                email: invitation.inviteeEmail,
                role: invitation.role,
                roleLabel: titleCase(invitation.role),
                expiresLabel: formatTimestamp(invitation.expiresAt),
                inviterName: invitation.inviter?.displayName || 'Unknown inviter',
                canRevoke: canManageRole(authorization, actorRole, invitation.role)
            }));

        return {
            restricted: false,
            canInvite: true,
            total: mappedMembers.length,
            members: mappedMembers,
            invitations: pendingInvitations,
            pendingInvitationCount: pendingInvitations.length,
            invitationRoleOptions: roleOptions(authorization, actorRole),
            roleGuide,
            actorRoleLabel: titleCase(actorRole)
        };
    }

    rewards(rewards, canManage) {
        const fulfillmentTypes = ['manual', 'deterministicBot']
            .filter((value) => configSchemas[value])
            .map((value) => ({ value, label: value === 'manual' ? 'Manual' : 'Deterministic bot' }));
        const executorActions = [
            { value: 'sendChat', label: 'Send chat message' },
            { value: 'runCommand', label: 'Run command' },
            { value: 'applyRole', label: 'Apply role' }
        ];

        const items = (rewards || []).map((reward) => {
            const policy = reward.eligibilityPolicy || { membership: 'any', providers: [] };
            return {
                id: reward.id,
                name: reward.name,
                description: reward.description,
                pointCost: Number(reward.pointCost),
                enabled: reward.enabled,
                statusLabel: reward.enabled ? 'Enabled' : 'Disabled',
                fulfillmentType: reward.fulfillmentType,
                fulfillmentLabel: reward.fulfillmentType === 'manual' ? 'Manual' : 'Deterministic bot',
                perUserCooldownSeconds: reward.perUserCooldownSeconds,
                globalCooldownSeconds: reward.globalCooldownSeconds,
                perStreamLimit: reward.perStreamLimit,
                eligibilityLabel: policy.membership === 'member' ? 'Members only' : policy.membership === 'nonMember' ? 'Non-members only' : 'Everyone',
                providerLabel: policy.providers?.length ? policy.providers.join(', ') : 'All providers',
                eligibilityOptions: eligibilityOptions(policy.membership),
                canManage
            };
        });

        return {
            total: items.length,
            enabled: items.filter((reward) => reward.enabled).length,
            disabled: items.filter((reward) => !reward.enabled).length,
            items,
            canManage,
            fulfillmentTypes,
            executorActions,
            eligibilityOptions: eligibilityOptions(),
            architectureNote: 'Reward fulfillment supports manual handling or deterministic bot execution.'
        };
    }

    points(policies, totals) {
        const eventLabels = {
            participationInterval: 'Participation interval',
            commandOutcome: 'Command outcome',
            moderatorGrant: 'Moderator grant'
        };
        const items = (policies || []).map((policy) => ({
            id: policy.id,
            name: policy.name,
            eventType: policy.eventType,
            eventLabel: eventLabels[policy.eventType] || titleCase(policy.eventType),
            points: Number(policy.points),
            perSessionCap: policy.perSessionCap,
            perDayCap: policy.perDayCap,
            enabled: policy.enabled,
            statusLabel: policy.enabled ? 'Enabled' : 'Disabled'
        }));

        return {
            participantCount: Number(totals?.participantCount || 0),
            availableBalance: Number(totals?.availableBalance || 0),
            lifetimeEarned: Number(totals?.lifetimeEarned || 0),
            lifetimeSpent: Number(totals?.lifetimeSpent || 0),
            policyCount: items.length,
            enabledPolicyCount: items.filter((policy) => policy.enabled).length,
            policies: items
        };
    }

    ai(configuration, canEdit) {
        const defaults = {
            invocationCommand: 'ai',
            provider: '',
            model: '',
            pricingPolicy: { pointCost: 1 },
            cooldownSeconds: 0,
            cooldownScope: 'participant',
            maxInputChars: 2000,
            maxOutputChars: 2000,
            maxOutputTokenCount: 512,
            timeoutMs: 5000
        };
        const value = { ...defaults, ...(configuration || {}) };
        const ready = Boolean(value.enabled && value.provider && value.model);
        return {
            configured: Boolean(configuration),
            enabled: Boolean(value.enabled),
            ready,
            statusLabel: !configuration ? 'Not configured' : !value.enabled ? 'Disabled' : ready ? 'Enabled' : 'Needs setup',
            statusTone: !value.enabled ? 'neutral' : ready ? 'live' : 'warning',
            invocationCommand: value.invocationCommand,
            commandLabel: `!${value.invocationCommand}`,
            provider: value.provider || '',
            model: value.model || '',
            pointCost: Number(value.pricingPolicy?.pointCost || 1),
            cooldownSeconds: Number(value.cooldownSeconds || 0),
            cooldownScope: value.cooldownScope,
            cooldownScopeOptions: cooldownScopeOptions(value.cooldownScope),
            maxInputChars: Number(value.maxInputChars),
            maxOutputChars: Number(value.maxOutputChars),
            maxOutputTokenCount: Number(value.maxOutputTokenCount),
            timeoutMs: Number(value.timeoutMs),
            configurationVersion: value.configurationVersion || null,
            canEdit
        };
    }

    instructions(versions, canEdit, canPublish) {
        const items = (versions || []).map((version) => {
            const findings = (version.findings || []).map((finding) => ({
                code: finding.code,
                severity: finding.severity,
                severityLabel: titleCase(finding.severity),
                message: finding.message
            }));
            const warningCount = findings.filter((finding) => finding.severity === 'warning').length;
            const approvedCurrentRevision = version.status === 'approved' && version.validatedRevision === version.revision;
            const warningsAcknowledged = warningCount === 0 || Boolean(version.warningsAcknowledgedAt);
            return {
                id: version.id,
                instruction: version.instruction,
                status: version.status,
                statusLabel: titleCase(version.status),
                revision: version.revision,
                findings,
                hasFindings: findings.length > 0,
                warningCount,
                errorCount: findings.filter((finding) => finding.severity === 'error').length,
                createdLabel: formatTimestamp(version.createdAt),
                publishedLabel: formatTimestamp(version.publishedAt),
                canUpdate: canEdit && ['draft', 'approved', 'rejected'].includes(version.status),
                canValidate: canEdit && version.status === 'draft',
                canAcknowledge: canEdit && approvedCurrentRevision && warningCount > 0 && !version.warningsAcknowledgedAt,
                canPublish: canPublish && approvedCurrentRevision && warningsAcknowledged,
                canRollback: canPublish && ['active', 'superseded'].includes(version.status),
                needsWarningAcknowledgement: approvedCurrentRevision && warningCount > 0 && !version.warningsAcknowledgedAt
            };
        });

        return {
            total: items.length,
            canCreate: canEdit,
            canPublish,
            items,
            active: items.find((version) => version.status === 'active') || null
        };
    }
};

module.exports.roleOrder = roleOrder;
