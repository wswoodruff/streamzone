'use strict';

const Schmervice = require('@hapipal/schmervice');
const { PromptComposer, PromptCompositionError, PLATFORM_POLICY } = require('../ai/prompt-composer');

const FAILURE = Object.freeze({
    refused: ['AI_MODEL_REFUSAL', 'model_refusal'], timed_out: ['AI_TIMEOUT', 'timeout'],
    provider_error: ['AI_PROVIDER_ERROR', 'provider'], moderated: ['AI_OUTPUT_MODERATED', 'moderation']
});

class AiExecutionError extends Error {
    constructor(code, message) { super(message); this.name = 'AiExecutionError'; this.code = code; }
}

module.exports = class AiRewardExecutorService extends Schmervice.Service {
    provider() {
        const provider = this.options?.provider || this.server.app.aiProvider;
        if (!provider || typeof provider.generate !== 'function') throw new AiExecutionError('AI_PROVIDER_UNAVAILABLE', 'AI provider is not configured.');
        return provider;
    }

    async execute({ streamerId, redemptionId, input, runtimeContext = null }) {
        if (typeof input !== 'string') throw new AiExecutionError('AI_INPUT_INVALID', 'AI reward input must be text.');
        const { RewardRedemption, RewardExecutorConfiguration, AiRewardExecution, StreamerInstructionVersion } = this.server.models();
        const redemption = await RewardRedemption.query().findOne({ id: redemptionId, streamerId });
        if (!redemption) throw new AiExecutionError('REDEMPTION_NOT_FOUND', 'Redemption not found.');
        if (redemption.status !== 'reserved') {
            const audit = await AiRewardExecution.query().findOne({ redemptionId });
            if (audit) return { redemption, execution: this.publicAudit(audit), replayed: true };
            throw new AiExecutionError('INVALID_REDEMPTION_STATE', 'Only reserved redemptions can execute.');
        }
        const stored = await RewardExecutorConfiguration.query().findById(redemption.rewardDefinitionId);
        const config = stored?.configuration;
        if (!config || input.length > config.maxInputChars) {
            const failed = await this.server.services().rewardService.fail(streamerId, redemptionId, 'AI_INPUT_LIMIT');
            return { redemption: failed, execution: { ok: false, failure: { code: 'AI_INPUT_LIMIT' } } };
        }

        let reservation;
        try { reservation = await this.reserveBudget(redemption, config); }
        catch (error) {
            if (!/^AI_(USER|STREAM)_BUDGET$/.test(error.code || '')) throw error;
            const failed = await this.server.services().rewardService.fail(streamerId, redemptionId, error.code);
            return { redemption: failed, execution: { ok: false, failure: { code: error.code } } };
        }
        if (reservation.replayed) return { redemption, execution: this.publicAudit(reservation.audit), replayed: true };

        const started = Date.now();
        const controller = new AbortController();
        let timer;
        try {
            const provider = this.provider();
            const conversation = await this.readConversation(redemption, config);
            const instruction = await StreamerInstructionVersion.query().findById(config.streamerInstructionVersionId);
            if (!instruction || instruction.streamerId !== streamerId) throw new PromptCompositionError('AI_STREAMER_INSTRUCTION_VERSION_INVALID', 'Published streamer instruction was not found.');
            const request = new PromptComposer().composeRequest({
                platformPolicyVersion: PLATFORM_POLICY,
                streamerInstructionVersion: { id: instruction.id, content: instruction.instruction },
                runtimeContext, conversationSummary: conversation, participantInput: input,
                provider: config.provider, model: config.model, maxOutputTokenCount: config.maxOutputTokenCount, signal: controller.signal
            });
            const timeout = new Promise((resolve) => {
                timer = setTimeout(() => { controller.abort(); resolve({ timedOut: true }); }, config.timeoutMs);
            });
            const response = await Promise.race([Promise.resolve().then(() => provider.generate(request)), timeout]);
            if (response?.timedOut) return this.fail(redemption, reservation.audit.id, 'timed_out', started);
            if (response?.refusal) return this.fail(redemption, reservation.audit.id, 'refused', started, response.usage);
            const output = response?.output;
            if (typeof output !== 'string' || output.length > config.maxOutputChars || Number(response?.usage?.outputTokenCount || 0) > config.maxOutputTokenCount) {
                return this.fail(redemption, reservation.audit.id, 'moderated', started, response?.usage, 'OUTPUT_LIMIT');
            }
            if (provider.moderateOutput && !(await provider.moderateOutput(output, { streamerId, redemptionId })).allowed) {
                return this.fail(redemption, reservation.audit.id, 'moderated', started, response?.usage);
            }
            const usage = this.usage(response?.usage, config);
            if (usage.estimatedProviderCost > config.maxCostMicros) return this.fail(redemption, reservation.audit.id, 'moderated', started, usage, 'COST_LIMIT');
            await this.completeAudit(reservation.audit.id, 'succeeded', started, usage);
            await this.server.services().pointEconomyService.settleReservation(String(redemption.id), `ai-settle:${redemption.id}`);
            const settled = await this.server.services().rewardService._transition(streamerId, redemptionId, 'fulfilled');
            await this.writeConversation(redemption, config, response.conversationState);
            return { redemption: settled, execution: { ok: true, output, audit: this.publicAudit(await AiRewardExecution.query().findById(reservation.audit.id)) } };
        }
        catch (error) {
            if (error?.name === 'AbortError') return this.fail(redemption, reservation.audit.id, 'timed_out', started);
            return this.fail(redemption, reservation.audit.id, 'provider_error', started, null, this.redactCode(error));
        }
        finally { clearTimeout(timer); }
    }

    async reserveBudget(redemption, config) {
        const { AiRewardExecution } = this.server.models();
        return AiRewardExecution.transaction(async (trx) => {
            const duplicate = await trx('AiRewardExecution').where({ redemptionId: redemption.id }).first();
            if (duplicate) return { audit: duplicate, replayed: true };
            const active = await trx('AiRewardExecution').where({ streamerId: redemption.streamerId }).whereIn('status', ['dispatching', 'succeeded']);
            const charged = (row) => row.status === 'dispatching' ? Number(row.reservedCostMicros) : Number(row.estimatedProviderCost || 0);
            const userTotal = active.filter((row) => row.chatUserId === redemption.chatUserId && row.streamSessionId === redemption.streamSessionId).reduce((sum, row) => sum + charged(row), 0);
            const streamTotal = active.filter((row) => row.streamSessionId === redemption.streamSessionId).reduce((sum, row) => sum + charged(row), 0);
            if (userTotal + config.maxCostMicros > config.perUserBudgetMicros) throw new AiExecutionError('AI_USER_BUDGET', 'Per-user AI budget exceeded.');
            if (!redemption.streamSessionId || streamTotal + config.maxCostMicros > config.perStreamBudgetMicros) throw new AiExecutionError('AI_STREAM_BUDGET', 'Per-stream AI budget exceeded.');
            const [audit] = await trx('AiRewardExecution').insert({
                redemptionId: redemption.id, streamerId: redemption.streamerId, chatUserId: redemption.chatUserId,
                streamSessionId: redemption.streamSessionId, provider: config.provider, model: config.model,
                platformPolicyVersionId: PLATFORM_POLICY.id, streamerInstructionVersionId: config.streamerInstructionVersionId,
                status: 'dispatching', pointCost: redemption.pointCost, reservedCostMicros: config.maxCostMicros
            }).returning('*');
            return { audit, replayed: false };
        });
    }

    usage(usage = {}, config) {
        const values = { inputTokenCount: Number(usage.inputTokenCount || 0), outputTokenCount: Number(usage.outputTokenCount || 0), estimatedProviderCost: Number(usage.estimatedProviderCost || 0) };
        if (!Object.values(values).every(Number.isSafeInteger) || Object.values(values).some((v) => v < 0) || values.outputTokenCount > config.maxOutputTokenCount) throw new AiExecutionError('AI_USAGE_INVALID', 'Provider returned invalid usage.');
        return values;
    }

    async fail(redemption, auditId, status, started, usage = {}, code) {
        const [failureCode, category] = FAILURE[status];
        await this.completeAudit(auditId, status, started, usage, code || failureCode, category);
        const refunded = await this.server.services().rewardService.fail(redemption.streamerId, redemption.id, failureCode);
        return { redemption: refunded, execution: { ok: false, failure: { code: failureCode }, audit: this.publicAudit(await this.server.models().AiRewardExecution.query().findById(auditId)) } };
    }

    async completeAudit(id, status, started, usage = {}, errorCode = null, errorCategory = null) {
        const safe = usage ? { inputTokenCount: Number(usage.inputTokenCount || 0), outputTokenCount: Number(usage.outputTokenCount || 0), estimatedProviderCost: Number(usage.estimatedProviderCost || 0) } : {};
        await this.server.models().AiRewardExecution.query().where({ id }).patch({ ...safe, status, latencyMs: Math.max(0, Date.now() - started), errorCode, errorCategory, completedAt: new Date().toISOString() });
    }

    redactCode(error) { return /^[A-Z][A-Z0-9_]{1,79}$/.test(error?.code || '') ? error.code : 'PROVIDER_FAILURE'; }
    publicAudit(row) { return { id: row.id, provider: row.provider, model: row.model, platformPolicyVersionId: row.platformPolicyVersionId, streamerInstructionVersionId: row.streamerInstructionVersionId, status: row.status, pointCost: row.pointCost, inputTokenCount: row.inputTokenCount, outputTokenCount: row.outputTokenCount, estimatedProviderCost: row.estimatedProviderCost, latencyMs: row.latencyMs, errorCode: row.errorCode, errorCategory: row.errorCategory }; }

    async readConversation(redemption, config) {
        if (!config.conversation?.enabled) return null;
        return (await this.server.services().streamSessionStateService.get(redemption.streamSessionId, `feature.ai-reward-${redemption.rewardDefinitionId}.conversation`, config.conversation.key, { access: { component: 'feature', featureId: `ai-reward-${redemption.rewardDefinitionId}` } }))?.value || null;
    }
    async writeConversation(redemption, config, state) {
        if (!config.conversation?.enabled || state === undefined) return;
        const service = this.server.services().streamSessionStateService;
        const namespace = `feature.ai-reward-${redemption.rewardDefinitionId}.conversation`;
        await service.update(redemption.streamSessionId, namespace, config.conversation.key, () => state, {
            access: { component: 'feature', featureId: `ai-reward-${redemption.rewardDefinitionId}` }, containsMessageContent: true,
            purpose: 'Bounded AI reward conversation state', expiresAt: new Date(Date.now() + config.conversation.retentionMs)
        });
    }
};

module.exports.AiExecutionError = AiExecutionError;
