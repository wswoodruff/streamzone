'use strict';

const SCOPES = Object.freeze(['global', 'streamer', 'session', 'participant']);

module.exports = ({ scope, commandId, streamerId, streamSessionId, participantId }) => {
    if (!SCOPES.includes(scope)) throw new TypeError(`Cooldown scope must explicitly be one of: ${SCOPES.join(', ')}.`);
    if (commandId === undefined || commandId === null) throw new TypeError('A commandId is required for a cooldown key.');
    const values = {
        global: [],
        streamer: [['streamer', streamerId]],
        session: [['session', streamSessionId]],
        participant: [['session', streamSessionId], ['participant', participantId]]
    }[scope];
    for (const [name, value] of values) {
        if (value === undefined || value === null) throw new TypeError(`${name} is required for ${scope} cooldown scope.`);
    }
    return ['command', commandId, 'scope', scope, ...values.flat()].join(':');
};

module.exports.SCOPES = SCOPES;
