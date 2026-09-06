'use strict';

const Assert = require('node:assert/strict');
const Test = require('node:test');
const { configSchemas } = require('../lib/services/reward-service');

let databaseAvailable = true;
try {
    require.resolve('@hapi/hapi');
    require.resolve('better-sqlite3');
}
catch {
    databaseAvailable = false;
}

Test('reward fulfillment domain contains only deterministic and manual execution', () => {
    Assert.deepEqual(Object.keys(configSchemas).sort(), ['deterministicBot', 'manual']);
});

if (!databaseAvailable) {
    Test('reward service database assertions (dependencies unavailable)', { skip: true }, () => {});
}
else {
    const { startServer, createTenant, createUser } = require('./helpers/server');

    Test('deterministic rewards own executor configuration while manual rewards do not', async (t) => {
        const context = await startServer(t);
        const owner = await createUser(context);
        const streamer = await createTenant(context, owner);
        const service = context.services.rewardService;

        const manual = await service.createReward(owner.user.id, streamer.id, {
            name: 'Manual shout-out', pointCost: 10, fulfillmentType: 'manual'
        });
        Assert.equal(await context.models.RewardExecutorConfiguration.query().findById(manual.id), undefined);

        const deterministic = await service.createReward(owner.user.id, streamer.id, {
            name: 'Bot response', pointCost: 20, fulfillmentType: 'deterministicBot',
            executorConfiguration: { action: 'sendChat', parameters: { text: 'Thanks!' } }
        });
        const stored = await context.models.RewardExecutorConfiguration.query().findById(deterministic.id);
        Assert.deepEqual(stored.configuration, { action: 'sendChat', parameters: { text: 'Thanks!' } });

        await service.updateReward(owner.user.id, streamer.id, deterministic.id, { fulfillmentType: 'manual' });
        Assert.equal(await context.models.RewardExecutorConfiguration.query().findById(deterministic.id), undefined);
    });

    Test('reward service rejects AI as a fulfillment type instead of adapting it', async (t) => {
        const context = await startServer(t);
        const owner = await createUser(context);
        const streamer = await createTenant(context, owner);
        await Assert.rejects(
            context.services.rewardService.createReward(owner.user.id, streamer.id, {
                name: 'Obsolete AI reward', pointCost: 10, fulfillmentType: 'ai'
            }),
            (error) => error.code === 'UNSUPPORTED_FULFILLMENT_TYPE'
        );
    });
}
