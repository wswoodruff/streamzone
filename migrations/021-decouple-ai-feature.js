'use strict';

const parseJson = (value, fallback = {}) => {
    if (value === null || value === undefined) return fallback;
    if (typeof value === 'object') return value;
    try { return JSON.parse(value); }
    catch { return fallback; }
};

exports.up = async (knex) => {
    await knex.schema.createTable('AiFeatureConfigurationNext', (table) => {
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

    if (await knex.schema.hasTable('AiFeatureConfiguration')) {
        const legacy = await knex('AiFeatureConfiguration as feature')
            .join('RewardDefinition as reward', 'reward.id', 'feature.rewardDefinitionId')
            .leftJoin('RewardExecutorConfiguration as executor', 'executor.rewardDefinitionId', 'reward.id')
            .select('reward.id as rewardDefinitionId', 'reward.streamerId', 'feature.pricingPolicy', 'executor.configuration')
            .where('reward.fulfillmentType', 'ai')
            .orderBy('reward.id', 'desc');
        const migrated = new Set();
        for (const row of legacy) {
            if (migrated.has(row.streamerId)) continue;
            migrated.add(row.streamerId);
            const executor = parseJson(row.configuration);
            const pricingPolicy = parseJson(row.pricingPolicy, { type: 'fixed', pointCost: 1 });
            await knex('AiFeatureConfigurationNext').insert({
                streamerId: row.streamerId,
                enabled: Boolean(executor.provider && executor.model),
                invocationCommand: 'ai',
                provider: executor.provider || null,
                model: executor.model || null,
                configurationVersion: `migrated-reward-${row.rewardDefinitionId}`,
                pricingPolicy: JSON.stringify(pricingPolicy),
                cooldownSeconds: 0,
                cooldownScope: 'participant',
                maxInputChars: Number(executor.maxInputChars || 2000),
                maxOutputChars: Number(executor.maxOutputChars || 2000),
                maxOutputTokenCount: Number(executor.maxOutputTokenCount || 512),
                timeoutMs: Number(executor.timeoutMs || 5000)
            });
        }
        await knex.schema.dropTable('AiFeatureConfiguration');
    }
    await knex.schema.renameTable('AiFeatureConfigurationNext', 'AiFeatureConfiguration');
    await knex('RewardDefinition').where({ fulfillmentType: 'ai' }).update({ enabled: false, updatedAt: new Date().toISOString() });

    // AiInvocation is now the sole AI execution/accounting record. The older
    // reward-scoped execution table is intentionally retired.
    await knex.schema.dropTableIfExists('AiRewardExecution');
};

exports.down = async (knex) => {
    await knex.schema.createTable('AiFeatureConfigurationLegacy', (table) => {
        table.integer('rewardDefinitionId').unsigned().primary().references('id').inTable('RewardDefinition').onDelete('CASCADE');
        table.json('pricingPolicy').notNullable();
        table.timestamp('updatedAt').notNullable().defaultTo(knex.fn.now());
    });

    const configurations = await knex('AiFeatureConfiguration').select('*');
    for (const configuration of configurations) {
        const reward = await knex('RewardDefinition')
            .where({ streamerId: configuration.streamerId, fulfillmentType: 'ai' })
            .orderBy('id', 'desc')
            .first();
        if (reward) {
            await knex('AiFeatureConfigurationLegacy').insert({
                rewardDefinitionId: reward.id,
                pricingPolicy: typeof configuration.pricingPolicy === 'string' ? configuration.pricingPolicy : JSON.stringify(configuration.pricingPolicy)
            });
        }
    }
    await knex.schema.dropTable('AiFeatureConfiguration');
    await knex.schema.renameTable('AiFeatureConfigurationLegacy', 'AiFeatureConfiguration');

    await knex.schema.createTable('AiRewardExecution', (table) => {
        table.increments('id').primary();
        table.integer('redemptionId').unsigned().notNullable().unique().references('id').inTable('RewardRedemption').onDelete('CASCADE');
        table.integer('streamerId').unsigned().notNullable().references('id').inTable('Streamer').onDelete('CASCADE');
        table.integer('chatUserId').unsigned().notNullable().references('id').inTable('ChatUser').onDelete('RESTRICT');
        table.integer('streamSessionId').unsigned().nullable().references('id').inTable('StreamSession').onDelete('SET NULL');
        table.string('provider', 80).notNullable();
        table.string('model', 160).notNullable();
        table.string('platformPolicyVersionId', 120).nullable();
        table.integer('streamerInstructionVersionId').unsigned().nullable().references('id').inTable('StreamerInstructionVersion').onDelete('RESTRICT');
        table.enum('status', ['dispatching', 'succeeded', 'refused', 'timed_out', 'provider_error', 'moderated']).notNullable();
        table.integer('pointCost').unsigned().notNullable().defaultTo(1);
        table.integer('inputTokenCount').unsigned().nullable();
        table.integer('outputTokenCount').unsigned().nullable();
        table.bigInteger('estimatedProviderCost').unsigned().nullable();
        table.bigInteger('reservedCostMicros').unsigned().notNullable();
        table.integer('latencyMs').unsigned().nullable();
        table.string('errorCode', 80).nullable();
        table.string('errorCategory', 40).nullable();
        table.timestamp('createdAt').notNullable().defaultTo(knex.fn.now());
        table.timestamp('completedAt').nullable();
        table.index(['streamerId', 'streamSessionId', 'status']);
        table.index(['streamerId', 'chatUserId', 'status']);
    });
};
