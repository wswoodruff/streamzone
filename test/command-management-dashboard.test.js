'use strict';

const Assert = require('node:assert/strict');
const Test = require('node:test');
const { addMembership, createTenant, createUser, injectAuthenticated, startServer } = require('./helpers/server');

const commandPayload = (overrides = {}) => ({
    name: 'rules',
    responseTemplate: 'Read the channel rules.',
    cooldownSeconds: 30,
    cooldownScope: 'participant',
    requiredChatRole: 'supermod',
    ...overrides
});

Test('command management renders full configuration, disabled commands, and canonical role selection', async (t) => {
    const context = await startServer(t);
    const owner = await createUser(context, { displayName: 'Owner Account' });
    const streamer = await createTenant(context, owner, 'owner', { displayName: 'Command Creator', slug: 'commands' });
    await context.services.streamingService.createCommand(owner.user.id, streamer.id, 'manageCommands', commandPayload({ enabled: false }));

    const response = await injectAuthenticated(context, owner, { method: 'GET', url: `/dashboard?streamerId=${streamer.id}` });

    Assert.equal(response.statusCode, 200);
    Assert.match(response.result, /Create command/);
    Assert.match(response.result, /!rules/);
    Assert.match(response.result, /Read the channel rules\./);
    Assert.match(response.result, /Disabled/);
    Assert.match(response.result, /Supermod · 30s participant/);
    Assert.match(response.result, /<option value="supermod" selected>Supermod<\/option>/);
    for (const role of ['everyone', 'moderator', 'supermod', 'owner']) Assert.match(response.result, new RegExp(`value="${role}"`));
    Assert.match(response.result, /\/assets\/styles\/command-management\.css/);
});

Test('command management shows a usable empty state', async (t) => {
    const context = await startServer(t);
    const owner = await createUser(context);
    const streamer = await createTenant(context, owner, 'owner');

    const response = await injectAuthenticated(context, owner, { method: 'GET', url: `/dashboard?streamerId=${streamer.id}` });

    Assert.equal(response.statusCode, 200);
    Assert.match(response.result, /No commands configured/);
    Assert.match(response.result, /Create command/);
});

Test('command management creates a command with POST-redirect-GET', async (t) => {
    const context = await startServer(t);
    const owner = await createUser(context);
    const streamer = await createTenant(context, owner, 'owner');

    const response = await injectAuthenticated(context, owner, {
        method: 'POST',
        url: `/dashboard/streamers/${streamer.id}/commands`,
        payload: commandPayload()
    });

    Assert.equal(response.statusCode, 303);
    Assert.equal(response.headers.location, `/dashboard?streamerId=${streamer.id}&commandStatus=created#commands`);
    const created = await context.models.Command.query().findOne({ streamerId: streamer.id, name: 'rules' });
    Assert.equal(created.responseTemplate, 'Read the channel rules.');
    Assert.equal(created.requiredChatRole, 'supermod');
});

Test('command management updates command fields', async (t) => {
    const context = await startServer(t);
    const owner = await createUser(context);
    const streamer = await createTenant(context, owner, 'owner');
    const command = await context.services.streamingService.createCommand(owner.user.id, streamer.id, 'manageCommands', commandPayload());

    const response = await injectAuthenticated(context, owner, {
        method: 'POST',
        url: `/dashboard/streamers/${streamer.id}/commands/${command.id}`,
        payload: commandPayload({ responseTemplate: 'Updated response.', cooldownSeconds: 5, cooldownScope: 'session', requiredChatRole: 'owner' })
    });

    Assert.equal(response.statusCode, 303);
    const updated = await context.models.Command.query().findById(command.id);
    Assert.equal(updated.responseTemplate, 'Updated response.');
    Assert.equal(updated.cooldownSeconds, 5);
    Assert.equal(updated.cooldownScope, 'session');
    Assert.equal(updated.requiredChatRole, 'owner');
});

Test('command management toggles disabled state without hiding the command', async (t) => {
    const context = await startServer(t);
    const owner = await createUser(context);
    const streamer = await createTenant(context, owner, 'owner');
    const command = await context.services.streamingService.createCommand(owner.user.id, streamer.id, 'manageCommands', commandPayload());

    const toggle = await injectAuthenticated(context, owner, {
        method: 'POST',
        url: `/dashboard/streamers/${streamer.id}/commands/${command.id}/toggle`,
        payload: { enabled: false }
    });
    Assert.equal(toggle.statusCode, 303);

    const response = await injectAuthenticated(context, owner, { method: 'GET', url: `/dashboard?streamerId=${streamer.id}` });
    Assert.equal(response.statusCode, 200);
    Assert.match(response.result, /!rules/);
    Assert.match(response.result, /Disabled/);
    Assert.match(response.result, />Enable<\/button>/);
});

Test('command management deletes with the dedicated confirmation endpoint', async (t) => {
    const context = await startServer(t);
    const owner = await createUser(context);
    const streamer = await createTenant(context, owner, 'owner');
    const command = await context.services.streamingService.createCommand(owner.user.id, streamer.id, 'manageCommands', commandPayload());

    const response = await injectAuthenticated(context, owner, {
        method: 'POST',
        url: `/dashboard/streamers/${streamer.id}/commands/${command.id}/delete`
    });

    Assert.equal(response.statusCode, 303);
    Assert.equal(await context.models.Command.query().findById(command.id), undefined);
});

Test('viewer can render commands but backend authorization rejects mutations', async (t) => {
    const context = await startServer(t);
    const owner = await createUser(context);
    const viewer = await createUser(context);
    const streamer = await createTenant(context, owner, 'owner');
    await addMembership(context, viewer, streamer, 'viewer');
    await context.services.streamingService.createCommand(owner.user.id, streamer.id, 'manageCommands', commandPayload());

    const page = await injectAuthenticated(context, viewer, { method: 'GET', url: `/dashboard?streamerId=${streamer.id}` });
    Assert.equal(page.statusCode, 200);
    Assert.match(page.result, /!rules/);
    Assert.match(page.result, /Viewer access can inspect every configured command/);
    Assert.doesNotMatch(page.result, /aria-label="Create command"/);

    const mutation = await injectAuthenticated(context, viewer, {
        method: 'POST',
        url: `/dashboard/streamers/${streamer.id}/commands`,
        payload: commandPayload({ name: 'blocked' })
    });
    Assert.equal(mutation.statusCode, 403);
    Assert.equal(await context.models.Command.query().findOne({ streamerId: streamer.id, name: 'blocked' }), undefined);
});

Test('invalid command input re-renders the management form with errors and submitted values', async (t) => {
    const context = await startServer(t);
    const owner = await createUser(context);
    const streamer = await createTenant(context, owner, 'owner');

    const response = await injectAuthenticated(context, owner, {
        method: 'POST',
        url: `/dashboard/streamers/${streamer.id}/commands`,
        payload: commandPayload({ name: 'Bad Name', responseTemplate: '', cooldownSeconds: 90000, requiredChatRole: 'vip' })
    });

    Assert.equal(response.statusCode, 400);
    Assert.match(response.result, /Fix the highlighted command fields and try again\./);
    Assert.match(response.result, /value="bad name"/i);
    Assert.match(response.result, /aria-invalid="true"/);
    Assert.equal(await context.models.Command.query().where({ streamerId: streamer.id }).resultSize(), 0);
});
