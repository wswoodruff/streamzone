'use strict';

const OUTCOME_TYPES = Object.freeze([
    'ignored', 'cooldown', 'unauthorized', 'insufficient_points',
    'accepted', 'fulfilled', 'failed', 'refunded'
]);

const requiredString = (value, name) => {
    if (typeof value !== 'string' || !value.length) throw new TypeError(`${name} must be a non-empty string.`);
    return value;
};

class ChatMessage {
    constructor({ id, provider, sourceId, providerUserId, text, occurredAt = new Date(), attributes = {} }) {
        this.id = requiredString(id, 'ChatMessage.id');
        this.provider = requiredString(provider, 'ChatMessage.provider');
        this.sourceId = requiredString(sourceId, 'ChatMessage.sourceId');
        this.providerUserId = requiredString(providerUserId, 'ChatMessage.providerUserId');
        this.text = requiredString(text, 'ChatMessage.text');
        this.occurredAt = new Date(occurredAt);
        if (Number.isNaN(this.occurredAt.getTime())) throw new TypeError('ChatMessage.occurredAt must be a valid date.');
        this.attributes = Object.freeze({ ...attributes });
        Object.freeze(this);
    }
}

class ChatResponse {
    constructor({ text, sourceId, replyToMessageId, attributes = {} }) {
        this.text = requiredString(text, 'ChatResponse.text');
        this.sourceId = requiredString(sourceId, 'ChatResponse.sourceId');
        this.replyToMessageId = replyToMessageId;
        this.attributes = Object.freeze({ ...attributes });
        Object.freeze(this);
    }
}

class InteractionOutcome {
    constructor(type, details = {}) {
        if (!OUTCOME_TYPES.includes(type)) throw new TypeError(`Unknown interaction outcome: ${type}.`);
        this.type = type;
        this.details = Object.freeze({ ...details });
        Object.freeze(this);
    }

    static ignored(details) { return new this('ignored', details); }
    static cooldown(details) { return new this('cooldown', details); }
    static unauthorized(details) { return new this('unauthorized', details); }
    static insufficientPoints(details) { return new this('insufficient_points', details); }
    static accepted(details) { return new this('accepted', details); }
    static fulfilled(details) { return new this('fulfilled', details); }
    static failed(details) { return new this('failed', details); }
    static refunded(details) { return new this('refunded', details); }
}

class InteractionContext {
    constructor(message, values = {}) {
        if (!(message instanceof ChatMessage)) throw new TypeError('InteractionContext.message must be a ChatMessage.');
        this.message = message;
        Object.assign(this, values);
    }

    finish(outcome) {
        if (!(outcome instanceof InteractionOutcome)) throw new TypeError('InteractionContext outcome must be an InteractionOutcome.');
        this.outcome = outcome;
        return this;
    }
}

module.exports = { ChatMessage, ChatResponse, InteractionContext, InteractionOutcome, OUTCOME_TYPES };
