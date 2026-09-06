'use strict';

const { prompt } = require('enquirer');

const baseUrl = process.env.TEST_CONSOLE_URL || `http://127.0.0.1:${process.env.TEST_CONSOLE_PORT || 3010}`;

const request = async (path, options = {}) => {
    let response;
    try {
        response = await fetch(`${baseUrl}${path}`, {
            ...options,
            headers: { 'content-type': 'application/json', ...(options.headers || {}) }
        });
    }
    catch (error) {
        throw new Error(`Cannot reach the test-console host at ${baseUrl}. Run "npm run console:host" in another terminal first. (${error.message})`);
    }
    const body = await response.json();
    if (!response.ok) throw Object.assign(new Error(body.error?.message || `HTTP ${response.status}`), { code: body.error?.code });
    return body;
};

const askInteger = async (message, initial, minimum = 0) => {
    const answer = await prompt({
        type: 'input', name: 'value', message, initial: String(initial),
        validate: (value) => Number.isSafeInteger(Number(value)) && Number(value) >= minimum ? true : `Enter an integer >= ${minimum}.`
    });
    return Number(answer.value);
};

const streamLabel = (stream) => {
    const status = stream.status === 'live' ? 'LIVE' : stream.status;
    return `[${status}] ${stream.streamer || `streamer ${stream.streamerId}`} / ${stream.provider} / ${stream.title || stream.externalId || `stream ${stream.id}`}`;
};
const identityLabel = (identity) => `${identity.displayName || identity.handle || identity.providerUserId} (@${identity.handle || identity.providerUserId}) [chatUser:${identity.chatUserId}]`;

const chooseClient = async () => {
    const bootstrap = await request('/__test-console/bootstrap');
    if (!bootstrap.streams.length) throw new Error('No streams exist yet. Create a streamer, StreamSession, source, and stream first, then reopen the console.');

    const orderedStreams = bootstrap.streams.toSorted((a, b) => (a.status === 'live' ? -1 : 1) - (b.status === 'live' ? -1 : 1));
    const { streamId } = await prompt({
        type: 'autocomplete', name: 'streamId', message: 'Which stream should this terminal simulate?', limit: 12,
        choices: orderedStreams.map((stream) => ({ name: String(stream.id), message: streamLabel(stream) }))
    });
    const stream = bootstrap.streams.find((item) => String(item.id) === String(streamId));
    const identities = bootstrap.identities.filter((identity) => identity.provider === stream.provider && identity.status === 'active');
    const { identity } = await prompt({
        type: 'autocomplete', name: 'identity', message: 'Who is chatting in this terminal?', limit: 12,
        choices: [{ name: '__new__', message: '+ New username / chat identity' }, ...identities.map((item) => ({ name: String(item.id), message: identityLabel(item) }))]
    });

    const payload = { streamId: stream.id };
    if (identity === '__new__') {
        const values = await prompt([
            { type: 'input', name: 'username', message: `${stream.provider} username / provider user ID:` },
            { type: 'input', name: 'displayName', message: 'Display name (blank = username):' }
        ]);
        payload.username = values.username;
        payload.displayName = values.displayName || values.username;
        const roles = await prompt({
            type: 'multiselect', name: 'relationships', message: 'Channel relationships for this user (optional):',
            choices: bootstrap.relationshipTypes.map((relationship) => ({ name: relationship, message: relationship }))
        });
        payload.relationships = roles.relationships;
    }
    else {
        payload.chatIdentityId = Number(identity);
        const { updateRoles } = await prompt({ type: 'confirm', name: 'updateRoles', message: 'Replace this identity\'s channel relationships for this source?', initial: false });
        if (updateRoles) {
            const roles = await prompt({
                type: 'multiselect', name: 'relationships', message: 'Channel relationships:',
                choices: bootstrap.relationshipTypes.map((relationship) => ({ name: relationship, message: relationship }))
            });
            payload.relationships = roles.relationships;
        }
    }

    const role = await prompt({
        type: 'select', name: 'commandRole', message: 'Simulated command access role:',
        choices: ['everyone', 'moderator', 'supermod', 'owner']
    });
    payload.commandRole = role.commandRole;
    return request('/__test-console/clients', { method: 'POST', body: JSON.stringify(payload) });
};

const printStatus = (status) => {
    const { client, balance, aiFeature } = status;
    console.log(`\nConnected: ${client.displayName} @ ${client.streamerName} (${client.provider})`);
    console.log(`Stream #${client.streamId} / Session #${client.streamSessionId} / ChatUser #${client.chatUserId}`);
    console.log(`Points: ${balance.availableBalance}`);
    console.log(aiFeature?.enabled ? `AI: !${aiFeature.invocationCommand} (${aiFeature.pricingPolicy.pointCost} pts, ${aiFeature.provider}/${aiFeature.model})` : 'AI: not configured/enabled');
};

const configureAi = async (clientId, status) => {
    const current = status.aiFeature || {};
    console.log('\nThis configures the standalone AI channel feature for the selected streamer. It does not create or modify a reward.');
    const values = await prompt([
        { type: 'input', name: 'invocationCommand', message: 'Invocation command:', initial: current.invocationCommand || 'ai' },
        { type: 'input', name: 'provider', message: 'Provider label:', initial: current.provider || 'console' },
        { type: 'input', name: 'model', message: 'Model label:', initial: current.model || 'mock' },
        { type: 'input', name: 'instruction', message: 'Streamer AI instruction (blank = keep existing/default):' }
    ]);
    values.pointCost = await askInteger('Point cost per AI invocation:', current.pricingPolicy?.pointCost || 1, 1);
    values.cooldownSeconds = await askInteger('AI cooldown seconds:', current.cooldownSeconds || 0, 0);
    const scopeChoices = ['participant', 'session', 'streamer', 'global'];
    const scope = await prompt({ type: 'select', name: 'cooldownScope', message: 'AI cooldown scope:', initial: Math.max(0, scopeChoices.indexOf(current.cooldownScope || 'participant')), choices: scopeChoices });
    values.cooldownScope = scope.cooldownScope;
    const updated = await request(`/__test-console/clients/${clientId}/ai`, { method: 'PUT', body: JSON.stringify(values) });
    printStatus(updated);
    return updated;
};

const help = () => console.log(`\nCommands:
  /help             Show this help
  /state            Show selected stream/user/session and AI config
  /balance          Show current point balance
  /points N         Add N points (negative N removes points)
  /ai               Configure the standalone AI feature for this streamer
  /switch           Pick another stream/user for this terminal
  /quit             Exit

Everything else is sent as a chat message, e.g. !hello or !ai explain skeptical theism.`);

const runClient = async (status) => {
    printStatus(status);
    help();
    while (true) {
        const { text } = await prompt({ type: 'input', name: 'text', message: `${status.client.displayName}>` });
        const value = text.trim();
        if (!value) continue;
        if (value === '/quit') return 'quit';
        if (value === '/switch') return 'switch';
        if (value === '/help') { help(); continue; }
        if (value === '/state' || value === '/balance') {
            status = await request(`/__test-console/clients/${status.client.id}`);
            value === '/state' ? printStatus(status) : console.log(`Points: ${status.balance.availableBalance}`);
            continue;
        }
        if (value === '/ai') { status = await configureAi(status.client.id, status); continue; }
        if (value === '/points' || value.startsWith('/points ')) {
            let amount = Number(value.slice('/points'.length).trim());
            if (!Number.isSafeInteger(amount) || amount === 0) amount = await askInteger('Points to add:', 100, 1);
            const adjusted = await request(`/__test-console/clients/${status.client.id}/points`, { method: 'POST', body: JSON.stringify({ amount }) });
            console.log(`Points: ${adjusted.balance.availableBalance}`);
            continue;
        }
        const result = await request(`/__test-console/clients/${status.client.id}/messages`, { method: 'POST', body: JSON.stringify({ text: value }) });
        if (result.response?.text) console.log(`← ${result.response.text}`);
        else console.log(`← [${result.outcome.type}] ${JSON.stringify(result.outcome.details || {})}`);
        if (result.error) console.log(`  error: ${result.error.code} - ${result.error.message}`);
        if (result.ai?.failure) console.log(`  ai: ${result.ai.failure.code}`);
        console.log(`  outcome=${result.outcome.type} points=${result.balance.availableBalance}`);
    }
};

const main = async () => {
    await request('/__test-console/health');
    console.log(`Streamzone test console -> ${baseUrl}`);
    console.log('Each terminal is an independent simulated chat user; the host shares runtime state across all terminals.');
    while (true) {
        const status = await chooseClient();
        const action = await runClient(status);
        if (action === 'quit') return;
    }
};

if (require.main === module) {
    main().catch((error) => {
        console.error(`[${error.code || 'error'}] ${error.message}`);
        process.exitCode = 1;
    });
}

module.exports = { main, chooseClient, runClient };
