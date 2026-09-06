'use strict';

const Assert = require('node:assert/strict');
const Test = require('node:test');
const { TERMINAL_POLICY, normalizeEventId } = require('../lib/ai/invocation-policy');

Test('AI terminal outcomes define an explicit charge or refund policy and reason code', () => {
    Assert.deepEqual(Object.keys(TERMINAL_POLICY).sort(), [
        'cancellation', 'cooldown', 'insufficient_balance', 'provider_failure', 'rejected_input',
        'response_delivery_failure', 'success', 'timeout', 'unsafe_output'
    ]);
    for (const [outcome, policy] of Object.entries(TERMINAL_POLICY)) {
        Assert.match(policy.settlement, /^(committed|released)$/);
        if (outcome !== 'success') Assert.match(policy.reasonCode, /^[A-Z][A-Z0-9_]+$/);
    }
    Assert.equal(TERMINAL_POLICY.response_delivery_failure.settlement, 'committed');
    Assert.equal(TERMINAL_POLICY.provider_failure.settlement, 'released');
});

Test('event identifiers have one stable normalized idempotency representation', () => {
    Assert.equal(normalizeEventId('  EVENT-Ａ  '), 'event-a');
});
