'use strict';

const cooldownKey = require('./cooldown-key');
const { ChatResponse, InteractionOutcome } = require('./contracts');
const { canRunCommand } = require('./command-permissions');

const DEFAULT_INSUFFICIENT_RESOURCE_MESSAGE = "You don't have enough points or tokens to perform this action.";
const active = (context) => !context.outcome;

exports.deduplication = ({ runtimeState, ttlMs = 300000 }) => async (context) => {
    if (!await runtimeState.rememberOnce(`${context.message.provider}:${context.message.id}`, ttlMs, context.message.occurredAt)) {
        context.finish(InteractionOutcome.ignored({ reason: 'duplicate' }));
    }
};
exports.identityResolution = ({ resolve }) => async (context) => {
    if (active(context)) context.identity = await resolve(context.message);
};
exports.relationshipRefresh = ({ refresh }) => async (context) => {
    if (active(context)) context.relationship = await refresh(context.message, context.identity);
};
exports.streamSessionResolution = ({ resolve }) => async (context) => {
    if (active(context)) Object.assign(context, await resolve(context.message, context.identity));
};
exports.moderation = ({ authorize }) => async (context) => {
    if (active(context) && !await authorize(context)) context.finish(InteractionOutcome.unauthorized());
};
exports.commandMatching = ({ match }) => async (context) => {
    if (!active(context)) return;
    const matched = await match(context.message.text, context);
    if (!matched) return context.finish(InteractionOutcome.ignored({ reason: 'not_a_command' }));
    Object.assign(context, matched);
    context.finish(InteractionOutcome.accepted({ commandId: context.command.id }));
};
exports.commandAuthorization = ({ authorize = (context) => canRunCommand(context.command, context.relationship) } = {}) => async (context) => {
    if (context.outcome?.type !== 'accepted') return;
    if (!await authorize(context)) {
        context.finish(InteractionOutcome.unauthorized({
            commandId: context.command.id,
            requiredChatRole: context.command.requiredChatRole || 'everyone'
        }));
    }
};
exports.cooldowns = ({ runtimeState, now = () => Date.now() }) => async (context) => {
    if (context.outcome?.type !== 'accepted' || !context.command.cooldownSeconds) return;
    const key = cooldownKey({
        scope: context.command.cooldownScope,
        commandId: context.command.id,
        streamerId: context.streamerId,
        streamSessionId: context.streamSessionId,
        participantId: context.participantId
    });
    const result = await runtimeState.consumeCooldown(key, context.command.cooldownSeconds * 1000, now());
    if (!result.allowed) context.finish(InteractionOutcome.cooldown({ retryAfterMs: result.retryAfterMs, scope: context.command.cooldownScope }));
};
exports.execution = ({ execute }) => async (context) => {
    if (context.outcome?.type !== 'accepted') return;
    try {
        const result = await execute(context);
        if (result?.response && !(result.response instanceof ChatResponse)) throw new TypeError('Executor response must be a ChatResponse.');
        Object.assign(context, result);
        context.finish(InteractionOutcome.fulfilled({ commandId: context.command.id }));
    }
    catch (error) {
        context.error = error;
        context.finish(InteractionOutcome.failed({ commandId: context.command.id, code: error.code || 'EXECUTION_FAILED' }));
    }
};
exports.accounting = ({ account }) => async (context) => {
    const result = await account(context);
    if (result?.insufficient) {
        const customMessage = typeof result.insufficientMessage === 'string' && result.insufficientMessage.trim() ? result.insufficientMessage : null;
        context.response = new ChatResponse({
            text: customMessage || DEFAULT_INSUFFICIENT_RESOURCE_MESSAGE,
            sourceId: context.message.sourceId,
            replyToMessageId: context.message.id
        });
        context.finish(InteractionOutcome.insufficientPoints({ required: result.required, available: result.available }));
    }
    else if (result?.refunded) context.finish(InteractionOutcome.refunded({ amount: result.amount, reason: result.reason }));
};
exports.audit = ({ record }) => async (context) => { await record(context); };
exports.responseDelivery = ({ deliver }) => async (context) => {
    if (context.response && ['fulfilled', 'refunded', 'insufficient_points'].includes(context.outcome?.type)) await deliver(context.response, context);
};

exports.DEFAULT_INSUFFICIENT_RESOURCE_MESSAGE = DEFAULT_INSUFFICIENT_RESOURCE_MESSAGE;
