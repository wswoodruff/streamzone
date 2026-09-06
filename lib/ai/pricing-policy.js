'use strict';

class PricingPolicy {
    quote() { throw new Error('Pricing policies must implement quote(context).'); }
}

class FixedPointPricingPolicy extends PricingPolicy {
    constructor(pointCost) {
        super();
        if (!Number.isSafeInteger(pointCost) || pointCost <= 0) throw new TypeError('pointCost must be a positive safe integer.');
        this.pointCost = pointCost;
    }

    // Future policies can use context for discounts or variable prices without
    // changing the caller-facing pricing contract.
    quote(context = {}) { return Object.freeze({ pointCost: this.pointCost }); }
}

const pricingPolicyFrom = (configuration) => {
    if (configuration?.type !== 'fixed') throw new TypeError('Unsupported AI pricing policy.');
    return new FixedPointPricingPolicy(configuration.pointCost);
};

module.exports = { PricingPolicy, FixedPointPricingPolicy, pricingPolicyFrom };
