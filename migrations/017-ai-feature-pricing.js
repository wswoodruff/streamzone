'use strict';

exports.up = async (knex) => {
    await knex.schema.createTable('AiFeatureConfiguration', (table) => {
        table.integer('rewardDefinitionId').unsigned().primary().references('id').inTable('RewardDefinition').onDelete('CASCADE');
        table.json('pricingPolicy').notNullable();
        table.timestamp('updatedAt').notNullable().defaultTo(knex.fn.now());
    });
    const existingAiFeatures = await knex('RewardDefinition').select('id', 'pointCost').where({ fulfillmentType: 'ai' });
    if (existingAiFeatures.length) await knex('AiFeatureConfiguration').insert(existingAiFeatures.map((reward) => ({
        rewardDefinitionId: reward.id,
        pricingPolicy: JSON.stringify({ type: 'fixed', pointCost: Number(reward.pointCost) })
    })));
    await knex.schema.alterTable('AiRewardExecution', (table) => {
        table.renameColumn('inputTokens', 'inputTokenCount');
        table.renameColumn('outputTokens', 'outputTokenCount');
        table.renameColumn('costMicros', 'estimatedProviderCost');
        table.integer('pointCost').unsigned().notNullable().defaultTo(1);
    });
    await knex('AiRewardExecution').update({
        pointCost: knex('RewardRedemption').select('pointCost').whereColumn('RewardRedemption.id', 'AiRewardExecution.redemptionId')
    });
};

exports.down = async (knex) => {
    await knex.schema.alterTable('AiRewardExecution', (table) => {
        table.dropColumn('pointCost');
        table.renameColumn('estimatedProviderCost', 'costMicros');
        table.renameColumn('outputTokenCount', 'outputTokens');
        table.renameColumn('inputTokenCount', 'inputTokens');
    });
    await knex.schema.dropTableIfExists('AiFeatureConfiguration');
};
