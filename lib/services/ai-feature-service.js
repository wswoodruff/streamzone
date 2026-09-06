'use strict';

const Joi = require('@hapi/joi');
const Schmervice = require('@hapipal/schmervice');
const { PromptComposer, PLATFORM_POLICY } = require('../ai/prompt-composer');
const { pricingPolicyFrom } = require('../ai/pricing-policy');

const invokeSchema = Joi.object({
    streamerId: Joi.number().integer().positive().required(),
    streamSessionId: Joi.number().integer().positive().required(),
    chatIdentityId: Joi.number().integer().positive().required(),
    input: Joi.string().allow('').max(12000).required(),
    eventId: Joi.string().trim().min(1).max(255).required(),
    runtimeContext: Joi.object().unknown(true).allow(null)
}).required();

class AiFeatureError extends Error {
    constructor(code, message) {
        super(message);
        this.name = 'AiFeatureError';
        this.code = code;
    }
}

module.exports = class AiFeatureService extends Schmervice.Service {
    configuration(streamerId) {
        return this.server.models().AiFeatureConfiguration.query().findById(streamerId);
    }

    provider() {
        const provider = this.options?.provider || this.server.app.aiProvider;
        if (!provider || typeof provider.generate !== 'function') {
            throw new AiFeatureError('AI_PROVIDER_UNAVAILABLE', 'AI provider is not configured.');
        }
        return provider;
    }

    async invoke(input) {
        const values = await invokeSchema.validateAsync(input, { stripUnknown: false });
        const { AiFeatureConfiguration, ChatIdentity, StreamSession, StreamerInstructionVersion } = this.server.models();
        const configuration = await AiFeatureConfiguration.query().findById(values.streamerId);
        if (!configuration?.enabled) return this.failure('AI_FEATURE_DISABLED');
        if (!configuration.provider || !configuration.model) return this.failure('AI_FEATURE_CONFIGURATION_INVALID');
        if (values.input.length > configuration.maxInputChars) return this.failure('AI_INPUT_LIMIT');

        const [session, identity, instruction] = await Promise.all([
            StreamSession.query().findOne({ id: values.streamSessionId, streamerId: values.streamerId }),
            ChatIdentity.query().findById(values.chatIdentityId),
            StreamerInstructionVersion.query().findOne({ streamerId: values.streamerId, status: 'active' }).orderBy('id', 'desc')
        ]);
        if (!session || !identity) return this.failure('AI_INVOCATION_CONTEXT_INVALID');
        if (!instruction) return this.failure('AI_INSTRUCTION_UNAVAILABLE');

        const quote = pricingPolicyFrom(configuration.pricingPolicy).quote({
            streamerId: values.streamerId,
            streamSessionId: values.streamSessionId,
            chatUserId: identity.chatUserId
        });

        let created;
        try {
            created = await this.server.services().aiInvocationService.create({
                streamerId: values.streamerId,
                streamSessionId: values.streamSessionId,
                chatUserId: identity.chatUserId,
                chatIdentityId: identity.id,
                configurationVersion: configuration.configurationVersion,
                instructionVersionId: instruction.id,
                eventId: values.eventId,
                quotedPointCost: quote.pointCost
            });
        }
        catch (error) {
            if (/insufficient point balance/i.test(error.message || '')) {
                const account = await this.server.models().PointAccount.query().findOne({ streamerId: values.streamerId, chatUserId: identity.chatUserId });
                return this.failure('INSUFFICIENT_BALANCE', {
                    required: quote.pointCost,
                    available: Number(account?.availableBalance || 0)
                });
            }
            throw error;
        }

        if (created.replayed) {
            return {
                ok: created.invocation.status === 'succeeded',
                replayed: true,
                output: null,
                pointCost: quote.pointCost,
                invocation: created.invocation
            };
        }

        const controller = new AbortController();
        let timer;
        try {
            const request = new PromptComposer().composeRequest({
                platformPolicyVersion: PLATFORM_POLICY,
                streamerInstructionVersion: { id: instruction.id, content: instruction.instruction },
                runtimeContext: values.runtimeContext,
                conversationSummary: null,
                participantInput: values.input,
                provider: configuration.provider,
                model: configuration.model,
                maxOutputTokenCount: configuration.maxOutputTokenCount,
                signal: controller.signal
            });
            const provider = this.provider();
            const timeout = new Promise((resolve) => {
                timer = setTimeout(() => {
                    controller.abort();
                    resolve({ timedOut: true });
                }, configuration.timeoutMs);
            });
            const response = await Promise.race([
                this.server.services().aiInvocationService.invokeProvider(created.invocation.id, () => provider.generate(request)),
                timeout
            ]);

            if (response?.timedOut) return this.finishFailure(created.invocation.id, 'timeout', 'AI_TIMEOUT', quote.pointCost);
            if (response?.refusal) return this.finishFailure(created.invocation.id, 'rejected_input', 'AI_MODEL_REFUSAL', quote.pointCost);

            const output = response?.output;
            const usage = this.usage(response?.usage, configuration);
            if (typeof output !== 'string' || output.length > configuration.maxOutputChars || usage.outputTokenCount > configuration.maxOutputTokenCount) {
                return this.finishFailure(created.invocation.id, 'unsafe_output', 'AI_OUTPUT_LIMIT', quote.pointCost, usage);
            }
            if (provider.moderateOutput) {
                const moderation = await provider.moderateOutput(output, { streamerId: values.streamerId, streamSessionId: values.streamSessionId });
                if (!moderation?.allowed) return this.finishFailure(created.invocation.id, 'unsafe_output', 'AI_OUTPUT_MODERATED', quote.pointCost, usage);
            }

            const invocation = await this.server.services().aiInvocationService.finish(created.invocation.id, 'success', usage);
            return { ok: true, output, usage, pointCost: quote.pointCost, invocation };
        }
        catch (error) {
            if (error?.name === 'AbortError') return this.finishFailure(created.invocation.id, 'timeout', 'AI_TIMEOUT', quote.pointCost);
            return this.finishFailure(created.invocation.id, 'provider_failure', error.code || 'AI_PROVIDER_FAILURE', quote.pointCost);
        }
        finally {
            clearTimeout(timer);
        }
    }

    usage(value = {}, configuration) {
        const usage = {
            inputTokenCount: Number(value?.inputTokenCount || 0),
            outputTokenCount: Number(value?.outputTokenCount || 0),
            estimatedProviderCost: Number(value?.estimatedProviderCost || 0)
        };
        if (!Object.values(usage).every(Number.isSafeInteger) || Object.values(usage).some((item) => item < 0)) {
            throw new AiFeatureError('AI_USAGE_INVALID', 'AI provider returned invalid usage metadata.');
        }
        return usage;
    }

    async finishFailure(invocationId, outcome, code, pointCost, usage = null) {
        const invocation = await this.server.services().aiInvocationService.finish(invocationId, outcome, usage);
        return this.failure(code, { pointCost, invocation });
    }

    failure(code, details = {}) {
        return { ok: false, failure: { code, ...details } };
    }
};

module.exports.AiFeatureError = AiFeatureError;
module.exports.invokeSchema = invokeSchema;
