'use strict';

const { InteractionContext, InteractionOutcome } = require('./contracts');

const STAGE_ORDER = Object.freeze([
    'deduplication', 'identityResolution', 'relationshipRefresh', 'streamSessionResolution',
    'moderation', 'commandMatching', 'commandAuthorization', 'cooldowns', 'execution',
    'accounting', 'audit', 'responseDelivery'
]);

class InteractionPipeline {
    constructor(stages) {
        const supplied = Object.keys(stages || {});
        const missing = STAGE_ORDER.filter((name) => typeof stages?.[name] !== 'function');
        const unknown = supplied.filter((name) => !STAGE_ORDER.includes(name));
        if (missing.length || unknown.length) {
            throw new TypeError(`Pipeline stages must match the runtime contract (missing: ${missing.join(', ') || 'none'}; unknown: ${unknown.join(', ') || 'none'}).`);
        }
        this.stages = stages;
    }

    async process(message, initial = {}) {
        const context = new InteractionContext(message, initial);
        for (const name of STAGE_ORDER) await this.stages[name](context);
        return context.finish(context.outcome || InteractionOutcome.ignored({ reason: 'no_outcome' }));
    }
}

module.exports = { InteractionPipeline, STAGE_ORDER };
