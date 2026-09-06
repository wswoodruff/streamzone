'use strict';

// Delivery failure is charged because provider work produced a safe response;
// every other unsuccessful outcome releases the viewer's reservation.
const TERMINAL_POLICY = Object.freeze({
    rejected_input: { status: 'rejected', settlement: 'released', reasonCode: 'AI_INPUT_REJECTED' },
    cooldown: { status: 'cooldown', settlement: 'released', reasonCode: 'AI_COOLDOWN' },
    insufficient_balance: { status: 'insufficient_balance', settlement: 'released', reasonCode: 'INSUFFICIENT_BALANCE' },
    timeout: { status: 'timed_out', settlement: 'released', reasonCode: 'AI_TIMEOUT' },
    provider_failure: { status: 'provider_failed', settlement: 'released', reasonCode: 'AI_PROVIDER_FAILURE' },
    unsafe_output: { status: 'unsafe_output', settlement: 'released', reasonCode: 'AI_UNSAFE_OUTPUT' },
    cancellation: { status: 'cancelled', settlement: 'released', reasonCode: 'AI_CANCELLED' },
    response_delivery_failure: { status: 'delivery_failed', settlement: 'committed', reasonCode: 'AI_RESPONSE_DELIVERY_FAILED' },
    success: { status: 'succeeded', settlement: 'committed', reasonCode: null }
});

const normalizeEventId = (value) => value.normalize('NFKC').trim().toLowerCase();

module.exports = { TERMINAL_POLICY, normalizeEventId };
