'use strict';

class ExecutorResult {
    static success(output = {}) { return { ok: true, output }; }
    static failure(code, details = null) { return { ok: false, failure: { code, details } }; }
}

class DeterministicBotExecutor {
    constructor(actions) { this.actions = actions; }
    async execute(context, configuration) {
        const action = this.actions?.[configuration.action];
        if (!action) return ExecutorResult.failure('BOT_ACTION_UNAVAILABLE');
        try { return ExecutorResult.success(await action(context, configuration.parameters)); }
        catch (error) { return ExecutorResult.failure('BOT_ACTION_FAILED', error.message); }
    }
}

class ManualExecutor {
    async execute() { return ExecutorResult.failure('MANUAL_FULFILLMENT_REQUIRED'); }
}

module.exports = { DeterministicBotExecutor, ManualExecutor, ExecutorResult };
