'use strict';

exports.up = async (knex) => {
    await knex.schema.createTable('User', (table) => {
        table.increments('id').primary();
        table.string('email', 254).notNullable().unique();
        table.string('displayName', 120).notNullable();
        table.string('passwordHash', 255).notNullable();
        table.timestamp('createdAt').notNullable().defaultTo(knex.fn.now());
    });

    await knex.schema.createTable('Streamer', (table) => {
        table.increments('id').primary();
        table.string('slug', 80).notNullable().unique();
        table.string('displayName', 120).notNullable();
        table.timestamp('createdAt').notNullable().defaultTo(knex.fn.now());
    });

    await knex.schema.createTable('Session', (table) => {
        table.string('id', 64).primary();
        table.integer('userId').unsigned().notNullable().references('id').inTable('User').onDelete('CASCADE');
        table.timestamp('expiresAt').notNullable();
        table.timestamp('createdAt').notNullable().defaultTo(knex.fn.now());
        table.index(['userId', 'expiresAt']);
    });

    await knex.schema.createTable('StreamerMembership', (table) => {
        table.integer('userId').unsigned().notNullable().references('id').inTable('User').onDelete('CASCADE');
        table.integer('streamerId').unsigned().notNullable().references('id').inTable('Streamer').onDelete('CASCADE');
        table.enum('role', ['owner', 'admin', 'editor', 'viewer']).notNullable().defaultTo('viewer');
        table.timestamp('createdAt').notNullable().defaultTo(knex.fn.now());
        table.timestamp('updatedAt').notNullable().defaultTo(knex.fn.now());
        table.unique(['userId', 'streamerId']);
        table.index(['userId']);
        table.index(['streamerId']);
    });

    await knex.schema.createTable('StreamerInvitation', (table) => {
        table.increments('id').primary();
        table.integer('streamerId').unsigned().notNullable().references('id').inTable('Streamer').onDelete('CASCADE');
        table.string('inviteeEmail', 254).notNullable();
        table.enum('role', ['owner', 'admin', 'editor', 'viewer']).notNullable();
        table.integer('inviterUserId').unsigned().notNullable().references('id').inTable('User').onDelete('CASCADE');
        table.string('tokenHash', 64).notNullable().unique();
        table.timestamp('expiresAt').notNullable();
        table.timestamp('acceptedAt').nullable();
        table.timestamp('revokedAt').nullable();
        table.timestamp('createdAt').notNullable().defaultTo(knex.fn.now());
        table.index(['streamerId', 'inviteeEmail']);
    });
    await knex.raw('CREATE UNIQUE INDEX `StreamerInvitation_active_email_unique` ON `StreamerInvitation` (`streamerId`, `inviteeEmail`) WHERE `acceptedAt` IS NULL AND `revokedAt` IS NULL');

    await knex.schema.createTable('ChatUser', (table) => {
        table.increments('id').primary();
        table.integer('userId').unsigned().nullable().references('id').inTable('User').onDelete('SET NULL');
        table.enum('status', ['active', 'merged']).notNullable().defaultTo('active');
        table.integer('mergedIntoChatUserId').unsigned().nullable().references('id').inTable('ChatUser').onDelete('SET NULL');
        table.timestamp('createdAt').notNullable().defaultTo(knex.fn.now());
        table.timestamp('updatedAt').notNullable().defaultTo(knex.fn.now());
        table.index('userId');
    });

    await knex.schema.createTable('ChatIdentity', (table) => {
        table.increments('id').primary();
        table.integer('chatUserId').unsigned().notNullable().references('id').inTable('ChatUser').onDelete('CASCADE');
        table.string('provider', 40).notNullable();
        table.string('providerUserId', 255).notNullable();
        table.string('handle', 255).nullable();
        table.string('displayName', 255).nullable();
        table.string('avatarUrl', 2048).nullable();
        table.timestamp('lastSeenAt').notNullable();
        table.timestamp('createdAt').notNullable().defaultTo(knex.fn.now());
        table.timestamp('updatedAt').notNullable().defaultTo(knex.fn.now());
        table.unique(['provider', 'providerUserId']);
        table.index('chatUserId');
    });

    await knex.schema.createTable('Source', (table) => {
        table.increments('id').primary();
        table.integer('streamerId').unsigned().notNullable().references('id').inTable('Streamer').onDelete('CASCADE');
        table.enum('provider', ['youtube', 'twitch']).notNullable();
        table.string('channelId', 255).notNullable();
        table.boolean('enabled').notNullable().defaultTo(true);
        table.timestamp('createdAt').notNullable().defaultTo(knex.fn.now());
        table.unique(['provider', 'channelId']);
    });

    await knex.schema.createTable('StreamSession', (table) => {
        table.increments('id').primary();
        table.integer('streamerId').unsigned().notNullable().references('id').inTable('Streamer').onDelete('CASCADE');
        table.string('title', 255).notNullable();
        table.enum('status', ['scheduled', 'live', 'ended']).notNullable().defaultTo('scheduled');
        table.timestamp('scheduledAt').nullable();
        table.timestamp('startedAt').nullable();
        table.timestamp('endedAt').nullable();
        table.json('publicMetadata').nullable();
        table.timestamp('createdAt').notNullable().defaultTo(knex.fn.now());
        table.timestamp('updatedAt').notNullable().defaultTo(knex.fn.now());
        table.index(['streamerId', 'status', 'scheduledAt']);
    });

    await knex.schema.createTable('Stream', (table) => {
        table.increments('id').primary();
        table.integer('sourceId').unsigned().notNullable().references('id').inTable('Source').onDelete('CASCADE');
        table.integer('streamSessionId').unsigned().notNullable().references('id').inTable('StreamSession').onDelete('CASCADE');
        table.string('externalId', 255).nullable();
        table.string('title', 255).nullable();
        table.enum('status', ['scheduled', 'live', 'offline']).notNullable().defaultTo('scheduled');
        table.timestamp('startedAt').nullable();
        table.timestamp('endedAt').nullable();
        table.timestamp('createdAt').notNullable().defaultTo(knex.fn.now());
        table.unique(['sourceId', 'externalId']);
        table.unique(['streamSessionId', 'sourceId']);
        table.index(['status', 'startedAt']);
        table.index('streamSessionId');
    });

    await knex.schema.createTable('Command', (table) => {
        table.increments('id').primary();
        table.integer('streamerId').unsigned().notNullable().references('id').inTable('Streamer').onDelete('CASCADE');
        table.string('name', 50).notNullable();
        table.string('responseTemplate', 1000).notNullable();
        table.boolean('enabled').notNullable().defaultTo(true);
        table.integer('cooldownSeconds').unsigned().notNullable().defaultTo(0);
        table.enum('cooldownScope', ['global', 'streamer', 'session', 'participant']).notNullable().defaultTo('streamer');
        table.enum('requiredChatRole', ['everyone', 'moderator', 'supermod', 'owner']).notNullable().defaultTo('everyone');
        table.timestamp('createdAt').notNullable().defaultTo(knex.fn.now());
        table.timestamp('updatedAt').notNullable().defaultTo(knex.fn.now());
        table.unique(['streamerId', 'name']);
        table.index(['streamerId', 'enabled']);
    });

    await knex.schema.createTable('ChannelRelationship', (table) => {
        table.increments('id').primary();
        table.integer('sourceId').unsigned().notNullable().references('id').inTable('Source').onDelete('CASCADE');
        table.integer('chatIdentityId').unsigned().notNullable().references('id').inTable('ChatIdentity').onDelete('CASCADE');
        table.enum('relationship', ['follower', 'subscriber', 'paid_member', 'moderator', 'vip', 'broadcaster']).notNullable();
        table.string('tier', 100).nullable();
        table.timestamp('observedAt').notNullable();
        table.timestamp('expiresAt').nullable();
        table.timestamp('createdAt').notNullable().defaultTo(knex.fn.now());
        table.timestamp('updatedAt').notNullable().defaultTo(knex.fn.now());
        table.unique(['sourceId', 'chatIdentityId', 'relationship']);
        table.index(['sourceId', 'chatIdentityId']);
        table.index('expiresAt');
    });

    await knex.schema.createTable('StreamSessionState', (table) => {
        table.increments('id').primary();
        table.integer('streamSessionId').unsigned().notNullable().references('id').inTable('StreamSession').onDelete('CASCADE');
        table.string('namespace', 100).notNullable();
        table.string('key', 160).notNullable();
        table.text('serializedValue').notNullable();
        table.integer('sizeBytes').unsigned().notNullable();
        table.integer('version').unsigned().notNullable().defaultTo(1);
        table.string('purpose', 255).nullable();
        table.timestamp('expiresAt').nullable();
        table.timestamp('createdAt').notNullable().defaultTo(knex.fn.now());
        table.timestamp('updatedAt').notNullable().defaultTo(knex.fn.now());
        table.unique(['streamSessionId', 'namespace', 'key']);
        table.index(['streamSessionId', 'expiresAt']);
        table.index('expiresAt');
    });

    const addCounters = (table) => {
        table.integer('messageCount').unsigned().notNullable().defaultTo(0);
        table.integer('watchRewardCount').unsigned().notNullable().defaultTo(0);
        table.integer('winCount').unsigned().notNullable().defaultTo(0);
        table.integer('commandCount').unsigned().notNullable().defaultTo(0);
    };
    const addExclusions = (table) => {
        table.boolean('privacyExcluded').notNullable().defaultTo(false);
        table.boolean('moderationExcluded').notNullable().defaultTo(false);
    };

    await knex.schema.createTable('StreamerParticipant', (table) => {
        table.increments('id').primary();
        table.integer('streamerId').unsigned().notNullable().references('id').inTable('Streamer').onDelete('CASCADE');
        table.integer('chatUserId').unsigned().notNullable().references('id').inTable('ChatUser').onDelete('CASCADE');
        table.timestamp('firstSeenAt').notNullable();
        table.timestamp('lastSeenAt').notNullable();
        addCounters(table);
        addExclusions(table);
        table.timestamp('createdAt').notNullable().defaultTo(knex.fn.now());
        table.timestamp('updatedAt').notNullable().defaultTo(knex.fn.now());
        table.unique(['streamerId', 'chatUserId']);
        table.index(['streamerId', 'privacyExcluded', 'moderationExcluded']);
    });

    await knex.schema.createTable('StreamSessionParticipant', (table) => {
        table.increments('id').primary();
        table.integer('streamSessionId').unsigned().notNullable().references('id').inTable('StreamSession').onDelete('CASCADE');
        table.integer('chatUserId').unsigned().notNullable().references('id').inTable('ChatUser').onDelete('CASCADE');
        table.timestamp('joinedAt').notNullable();
        table.timestamp('lastActivityAt').notNullable();
        addCounters(table);
        addExclusions(table);
        table.timestamp('createdAt').notNullable().defaultTo(knex.fn.now());
        table.timestamp('updatedAt').notNullable().defaultTo(knex.fn.now());
        table.unique(['streamSessionId', 'chatUserId']);
        table.index(['streamSessionId', 'privacyExcluded', 'moderationExcluded']);
    });

    await knex.schema.createTable('ParticipantActivityEvent', (table) => {
        table.increments('id').primary();
        table.string('idempotencyKey', 255).notNullable().unique();
        table.integer('streamerId').unsigned().notNullable().references('id').inTable('Streamer').onDelete('CASCADE');
        table.integer('streamSessionId').unsigned().notNullable().references('id').inTable('StreamSession').onDelete('CASCADE');
        table.integer('chatUserId').unsigned().notNullable().references('id').inTable('ChatUser').onDelete('CASCADE');
        table.enum('type', ['message', 'watchReward', 'win', 'command']).notNullable();
        table.integer('amount').unsigned().notNullable();
        table.timestamp('occurredAt').notNullable();
        table.timestamp('createdAt').notNullable().defaultTo(knex.fn.now());
    });

    await knex.schema.createTable('PointAccount', (table) => {
        table.increments('id').primary();
        table.integer('streamerId').unsigned().notNullable().references('id').inTable('Streamer').onDelete('CASCADE');
        table.integer('chatUserId').unsigned().notNullable().references('id').inTable('ChatUser').onDelete('CASCADE');
        table.integer('availableBalance').notNullable().defaultTo(0);
        table.integer('lifetimeEarned').unsigned().notNullable().defaultTo(0);
        table.integer('lifetimeSpent').unsigned().notNullable().defaultTo(0);
        table.timestamp('createdAt').notNullable().defaultTo(knex.fn.now());
        table.timestamp('updatedAt').notNullable().defaultTo(knex.fn.now());
        table.unique(['streamerId', 'chatUserId']);
        table.check('?? >= 0', ['availableBalance']);
        table.check('?? >= 0', ['lifetimeEarned']);
        table.check('?? >= 0', ['lifetimeSpent']);
    });

    await knex.schema.createTable('EarningPolicy', (table) => {
        table.increments('id').primary();
        table.integer('streamerId').unsigned().notNullable().references('id').inTable('Streamer').onDelete('CASCADE');
        table.enum('eventType', ['participationInterval', 'commandOutcome', 'moderatorGrant']).notNullable();
        table.string('name', 120).notNullable();
        table.integer('points').unsigned().notNullable();
        table.integer('perSessionCap').unsigned().nullable();
        table.integer('perDayCap').unsigned().nullable();
        table.boolean('enabled').notNullable().defaultTo(true);
        table.timestamp('createdAt').notNullable().defaultTo(knex.fn.now());
        table.timestamp('updatedAt').notNullable().defaultTo(knex.fn.now());
        table.unique(['streamerId', 'eventType', 'name']);
        table.check('?? > 0', ['points']);
    });

    await knex.schema.createTable('PointLedgerEntry', (table) => {
        table.increments('id').primary();
        table.integer('accountId').unsigned().notNullable().references('id').inTable('PointAccount').onDelete('RESTRICT');
        table.integer('earningPolicyId').unsigned().nullable().references('id').inTable('EarningPolicy').onDelete('SET NULL');
        table.integer('streamSessionId').unsigned().nullable().references('id').inTable('StreamSession').onDelete('SET NULL');
        table.string('relatedExecutionId', 255).nullable();
        table.integer('delta').notNullable();
        table.enum('type', ['award', 'reserve', 'spend', 'refund', 'adjustment']).notNullable();
        table.string('reason', 255).notNullable();
        table.enum('actorType', ['system', 'moderator', 'user']).notNullable();
        table.string('actorId', 255).notNullable();
        table.string('idempotencyKey', 255).notNullable().unique();
        table.timestamp('createdAt').notNullable().defaultTo(knex.fn.now());
        table.check("(type IN ('award', 'refund') AND delta > 0) OR (type IN ('reserve', 'spend') AND delta < 0) OR (type = 'adjustment' AND delta <> 0)");
        table.index(['accountId', 'createdAt']);
        table.index(['earningPolicyId', 'createdAt']);
        table.index(['streamSessionId', 'accountId']);
    });

    await knex.schema.createTable('PointReservationSettlement', (table) => {
        table.increments('id').primary();
        table.integer('ledgerEntryId').unsigned().notNullable().unique().references('id').inTable('PointLedgerEntry').onDelete('RESTRICT');
        table.string('idempotencyKey', 255).notNullable().unique();
        table.timestamp('createdAt').notNullable().defaultTo(knex.fn.now());
    });

    await knex.schema.createTable('RewardDefinition', (table) => {
        table.increments('id').primary();
        table.integer('streamerId').unsigned().notNullable().references('id').inTable('Streamer').onDelete('CASCADE');
        table.string('name', 120).notNullable();
        table.text('description').notNullable().defaultTo('');
        table.integer('pointCost').unsigned().notNullable();
        table.boolean('enabled').notNullable().defaultTo(true);
        table.enum('fulfillmentType', ['deterministicBot', 'manual']).notNullable();
        table.integer('perUserCooldownSeconds').unsigned().nullable();
        table.integer('globalCooldownSeconds').unsigned().nullable();
        table.integer('perStreamLimit').unsigned().nullable();
        table.json('eligibilityPolicy').notNullable();
        table.timestamp('createdAt').notNullable().defaultTo(knex.fn.now());
        table.timestamp('updatedAt').notNullable().defaultTo(knex.fn.now());
        table.unique(['streamerId', 'name']);
        table.check('?? > 0', ['pointCost']);
    });

    await knex.schema.createTable('RewardExecutorConfiguration', (table) => {
        table.integer('rewardDefinitionId').unsigned().primary().references('id').inTable('RewardDefinition').onDelete('CASCADE');
        table.json('configuration').notNullable();
        table.timestamp('updatedAt').notNullable().defaultTo(knex.fn.now());
    });

    await knex.schema.createTable('RewardRedemption', (table) => {
        table.increments('id').primary();
        table.integer('streamerId').unsigned().notNullable().references('id').inTable('Streamer').onDelete('CASCADE');
        table.integer('rewardDefinitionId').unsigned().notNullable().references('id').inTable('RewardDefinition').onDelete('RESTRICT');
        table.integer('chatUserId').unsigned().notNullable().references('id').inTable('ChatUser').onDelete('RESTRICT');
        table.integer('streamSessionId').unsigned().nullable().references('id').inTable('StreamSession').onDelete('SET NULL');
        table.integer('pointCost').unsigned().notNullable();
        table.enum('status', ['requested', 'reserved', 'fulfilled', 'rejected', 'cancelled', 'refunded']).notNullable();
        table.string('idempotencyKey', 255).notNullable();
        table.string('failureCode', 80).nullable();
        table.text('failureDetails').nullable();
        table.timestamp('createdAt').notNullable().defaultTo(knex.fn.now());
        table.timestamp('updatedAt').notNullable().defaultTo(knex.fn.now());
        table.timestamp('fulfilledAt').nullable();
        table.unique(['streamerId', 'chatUserId', 'idempotencyKey']);
        table.index(['rewardDefinitionId', 'status', 'createdAt']);
        table.index(['chatUserId', 'streamerId', 'createdAt']);
    });

    await knex.schema.createTable('StreamerInstructionVersion', (table) => {
        table.increments('id').primary();
        table.integer('streamerId').unsigned().notNullable().references('id').inTable('Streamer').onDelete('CASCADE');
        table.text('instruction').notNullable();
        table.enum('status', ['draft', 'approved', 'rejected', 'active', 'superseded']).notNullable().defaultTo('draft');
        table.integer('revision').unsigned().notNullable().defaultTo(1);
        table.integer('validatedRevision').unsigned().nullable();
        table.json('findings').nullable();
        table.string('policyVersion', 120).nullable();
        table.string('checkerVersion', 120).nullable();
        table.integer('createdBy').unsigned().nullable().references('id').inTable('User').onDelete('SET NULL');
        table.integer('reviewedBy').unsigned().nullable().references('id').inTable('User').onDelete('SET NULL');
        table.integer('publishedBy').unsigned().nullable().references('id').inTable('User').onDelete('SET NULL');
        table.integer('basedOnVersionId').unsigned().nullable().references('id').inTable('StreamerInstructionVersion').onDelete('SET NULL');
        table.timestamp('validationRequestedAt').nullable();
        table.timestamp('reviewedAt').nullable();
        table.timestamp('warningsAcknowledgedAt').nullable();
        table.integer('warningsAcknowledgedBy').unsigned().nullable().references('id').inTable('User').onDelete('SET NULL');
        table.timestamp('publishedAt').nullable();
        table.timestamp('supersededAt').nullable();
        table.timestamp('createdAt').notNullable().defaultTo(knex.fn.now());
        table.timestamp('updatedAt').notNullable().defaultTo(knex.fn.now());
        table.index(['streamerId', 'createdAt']);
    });
    await knex.raw("CREATE UNIQUE INDEX streamer_instruction_one_active ON StreamerInstructionVersion(streamerId) WHERE status = 'active'");

    await knex.schema.createTable('AiFeatureConfiguration', (table) => {
        table.integer('streamerId').unsigned().primary().references('id').inTable('Streamer').onDelete('CASCADE');
        table.boolean('enabled').notNullable().defaultTo(false);
        table.string('invocationCommand', 50).notNullable().defaultTo('ai');
        table.string('provider', 80).nullable();
        table.string('model', 160).nullable();
        table.string('configurationVersion', 120).notNullable();
        table.json('pricingPolicy').notNullable();
        table.integer('cooldownSeconds').unsigned().notNullable().defaultTo(0);
        table.enum('cooldownScope', ['global', 'streamer', 'session', 'participant']).notNullable().defaultTo('participant');
        table.integer('maxInputChars').unsigned().notNullable().defaultTo(2000);
        table.integer('maxOutputChars').unsigned().notNullable().defaultTo(2000);
        table.integer('maxOutputTokenCount').unsigned().notNullable().defaultTo(512);
        table.integer('timeoutMs').unsigned().notNullable().defaultTo(5000);
        table.timestamp('updatedAt').notNullable().defaultTo(knex.fn.now());
    });

    await knex.schema.createTable('AiInvocation', (table) => {
        table.increments('id').primary();
        table.integer('streamerId').unsigned().notNullable().references('id').inTable('Streamer').onDelete('CASCADE');
        table.integer('streamSessionId').unsigned().notNullable().references('id').inTable('StreamSession').onDelete('RESTRICT');
        table.integer('chatUserId').unsigned().notNullable().references('id').inTable('ChatUser').onDelete('RESTRICT');
        table.integer('chatIdentityId').unsigned().notNullable().references('id').inTable('ChatIdentity').onDelete('RESTRICT');
        table.string('configurationVersion', 120).notNullable();
        table.integer('instructionVersionId').unsigned().notNullable().references('id').inTable('StreamerInstructionVersion').onDelete('RESTRICT');
        table.string('idempotencyKey', 255).notNullable();
        table.integer('quotedPointCost').unsigned().notNullable();
        table.enum('status', ['reserved', 'dispatching', 'succeeded', 'rejected', 'cooldown', 'insufficient_balance', 'timed_out', 'provider_failed', 'unsafe_output', 'cancelled', 'delivery_failed']).notNullable();
        table.enum('reservationStatus', ['reserved', 'committed', 'released']).notNullable();
        table.string('reasonCode', 80).nullable();
        table.json('usageMetadata').nullable();
        table.integer('reservationLedgerEntryId').unsigned().notNullable().unique().references('id').inTable('PointLedgerEntry').onDelete('RESTRICT');
        table.timestamp('createdAt').notNullable().defaultTo(knex.fn.now());
        table.timestamp('updatedAt').notNullable().defaultTo(knex.fn.now());
        table.timestamp('startedAt').nullable();
        table.timestamp('completedAt').nullable();
        table.unique(['streamerId', 'chatIdentityId', 'idempotencyKey']);
        table.index(['status', 'reservationStatus', 'updatedAt']);
        table.check('?? > 0', ['quotedPointCost']);
    });
};

exports.down = async (knex) => {
    await knex.schema.dropTableIfExists('AiInvocation');
    await knex.schema.dropTableIfExists('AiFeatureConfiguration');
    await knex.schema.dropTableIfExists('StreamerInstructionVersion');
    await knex.schema.dropTableIfExists('RewardRedemption');
    await knex.schema.dropTableIfExists('RewardExecutorConfiguration');
    await knex.schema.dropTableIfExists('RewardDefinition');
    await knex.schema.dropTableIfExists('PointReservationSettlement');
    await knex.schema.dropTableIfExists('PointLedgerEntry');
    await knex.schema.dropTableIfExists('EarningPolicy');
    await knex.schema.dropTableIfExists('PointAccount');
    await knex.schema.dropTableIfExists('ParticipantActivityEvent');
    await knex.schema.dropTableIfExists('StreamSessionParticipant');
    await knex.schema.dropTableIfExists('StreamerParticipant');
    await knex.schema.dropTableIfExists('StreamSessionState');
    await knex.schema.dropTableIfExists('ChannelRelationship');
    await knex.schema.dropTableIfExists('Command');
    await knex.schema.dropTableIfExists('Stream');
    await knex.schema.dropTableIfExists('StreamSession');
    await knex.schema.dropTableIfExists('Source');
    await knex.schema.dropTableIfExists('ChatIdentity');
    await knex.schema.dropTableIfExists('ChatUser');
    await knex.schema.dropTableIfExists('StreamerInvitation');
    await knex.schema.dropTableIfExists('StreamerMembership');
    await knex.schema.dropTableIfExists('Session');
    await knex.schema.dropTableIfExists('Streamer');
    await knex.schema.dropTableIfExists('User');
};
