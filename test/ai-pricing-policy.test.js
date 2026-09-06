'use strict';

const Assert = require('node:assert/strict');
const Test = require('node:test');
const { FixedPointPricingPolicy, PricingPolicy, pricingPolicyFrom } = require('../lib/ai/pricing-policy');

Test('fixed AI pricing quotes channel points independently of provider usage', () => {
    const policy = new FixedPointPricingPolicy(75);
    Assert.equal(policy instanceof PricingPolicy, true);
    Assert.deepEqual(policy.quote({ inputTokenCount: 1000, outputTokenCount: 500, estimatedProviderCost: 999 }), { pointCost: 75 });
    Assert.deepEqual(pricingPolicyFrom({ type: 'fixed', pointCost: 12 }).quote(), { pointCost: 12 });
});

Test('fixed AI pricing rejects invalid point costs and unknown policy types', () => {
    Assert.throws(() => new FixedPointPricingPolicy(0), /pointCost/);
    Assert.throws(() => pricingPolicyFrom({ type: 'token-based', pointCost: 1 }), /Unsupported/);
});
