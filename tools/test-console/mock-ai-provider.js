'use strict';

const estimateTokens = (value) => Math.max(1, Math.ceil(String(value || '').length / 4));

module.exports = class ConsoleAiProvider {
    async generate(request) {
        const input = request.messages.at(-1)?.content || '';
        const output = `[mock ai/${request.model}] ${input}`;
        return {
            output,
            usage: {
                inputTokenCount: request.messages.reduce((total, message) => total + estimateTokens(message.content), 0),
                outputTokenCount: estimateTokens(output),
                estimatedProviderCost: 0
            }
        };
    }

    async moderateOutput() {
        return { allowed: true };
    }
};
