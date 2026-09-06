'use strict';

const { expect, loginAsOwner, test } = require('./fixtures');

const projectSuffix = (testInfo) => testInfo.project.name.replace(/[^a-z0-9]/g, '');

test('dashboard requires an authenticated session', async ({ page }) => {
    await page.goto('/dashboard');

    await expect(page).toHaveURL(/\/login\?next=/);
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
});

test('owner signs in, sees seeded management state, and signs out', async ({ page }) => {
    await loginAsOwner(page);

    await expect(page.getByText('@aurora-live', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Stream session' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Sources' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Commands' })).toBeVisible();
    await expect(page.locator('#stream .status-panel h3')).toBeVisible();
    await expect(page.locator('#sources').getByRole('heading', { name: 'Twitch', exact: true }).first()).toBeVisible();
    await expect(page.locator('#sources').getByRole('heading', { name: 'YouTube', exact: true }).first()).toBeVisible();
    await expect(page.locator('#commands').getByRole('heading', { name: '!schedule' })).toBeVisible();
    await expect(page.getByText('Moderator · 15s session', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/$/);

    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login\?next=/);
});

test('owner manages invitations and standalone AI from the dashboard', async ({ page }, testInfo) => {
    await loginAsOwner(page);
    const suffix = projectSuffix(testInfo);
    const inviteEmail = `playwright-invite-${suffix}@example.com`;
    const aiCommand = `askbot${suffix}`;
    const instruction = `Answer ${suffix} channel questions with concise, relevant context.`;

    await expect(page.getByRole('heading', { name: 'Management team' })).toBeVisible();
    await expect(page.getByText('Taylor Editor', { exact: true })).toBeVisible();
    await expect(page.getByText('pending.e2e@example.com', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Rewards & points' })).toBeVisible();
    await expect(page.getByText('Hydrate', { exact: true })).toBeVisible();
    await expect(page.getByText('Watch time', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Standalone AI' })).toBeVisible();
    await expect(page.locator('#ai .management-grid article').first().locator('h3')).toBeVisible();
    await expect(page.getByText('Streamer instructions', { exact: true })).toBeVisible();

    const rewardTypes = await page.locator('select[name="fulfillmentType"] option').allTextContents();
    expect(rewardTypes).toEqual(['Manual', 'Deterministic bot']);

    const inviteGroup = page.getByRole('group', { name: 'Invite a team member' });
    await inviteGroup.getByLabel('Email address').fill(inviteEmail);
    await inviteGroup.getByLabel('Role').selectOption('editor');
    await page.getByRole('button', { name: 'Create invitation' }).click();
    await expect(page.getByRole('status')).toContainText('Invitation created');
    await expect(page.getByText(inviteEmail, { exact: true })).toBeVisible();

    const aiForm = page.locator('form[action="/dashboard/ai"]');
    await aiForm.getByLabel('Invocation command').fill(aiCommand);
    await aiForm.getByLabel('Point cost').fill('30');
    await page.getByRole('button', { name: 'Save AI configuration' }).click();
    await expect(page.getByRole('status')).toContainText('Standalone AI configuration updated');
    await expect(page.locator('#ai').getByRole('heading', { name: `!${aiCommand}` })).toBeVisible();
    await expect(aiForm.getByLabel('Invocation command')).toHaveValue(aiCommand);

    await page.getByText('Create instruction draft', { exact: true }).click();
    await page.getByRole('textbox', { name: 'Streamer instruction', exact: true }).fill(instruction);
    await page.getByRole('button', { name: 'Create draft' }).click();
    await expect(page.getByRole('status')).toContainText('AI instruction draft created');
    await expect(page.locator('#ai .instruction-copy').filter({ hasText: instruction }).first()).toHaveText(instruction);
});

test('owner creates, edits, disables, and deletes a command', async ({ page }, testInfo) => {
    await loginAsOwner(page);
    const name = `rules-${projectSuffix(testInfo)}`;
    const commands = page.locator('#commands');
    const createForm = commands.getByRole('form', { name: 'Create command' });

    await createForm.getByLabel('Command name').fill(name);
    await createForm.getByLabel('Response template').fill('Read the rules before chatting.');
    await createForm.getByLabel('Cooldown seconds').fill('30');
    await createForm.getByLabel('Cooldown scope').selectOption('participant');
    await createForm.getByLabel('Required chat role').selectOption('supermod');
    await createForm.getByRole('button', { name: 'Create command' }).click();

    await expect(commands.getByRole('status')).toHaveText('Command created.');
    let card = commands.locator(`[data-command-name="${name}"]`);
    await expect(card).toContainText('Supermod · 30s participant');
    await expect(card).toContainText('Read the rules before chatting.');

    await card.locator('.command-editor summary').click();
    const editForm = card.getByRole('form', { name: `Edit !${name} command` });
    await editForm.getByLabel('Response template').fill('Updated rules response.');
    await editForm.getByLabel('Cooldown seconds').fill('5');
    await editForm.getByLabel('Cooldown scope').selectOption('session');
    await editForm.getByLabel('Required chat role').selectOption('owner');
    await editForm.getByRole('button', { name: 'Save changes' }).click();

    await expect(commands.getByRole('status')).toHaveText('Command updated.');
    card = commands.locator(`[data-command-name="${name}"]`);
    await expect(card).toContainText('Owner · 5s session');
    await expect(card).toContainText('Updated rules response.');

    await card.getByRole('button', { name: 'Disable' }).click();
    await expect(commands.getByRole('status')).toHaveText('Command disabled.');
    card = commands.locator(`[data-command-name="${name}"]`);
    await expect(card.getByText('Disabled', { exact: true })).toBeVisible();
    await expect(card.getByRole('button', { name: 'Enable' })).toBeVisible();

    await card.locator('.delete-confirm summary').click();
    await card.getByRole('button', { name: 'Delete command' }).click();
    await expect(commands.getByRole('status')).toHaveText('Command deleted.');
    await expect(commands.locator(`[data-command-name="${name}"]`)).toHaveCount(0);
});

test('owner manages Sources, StreamSessions, and provider broadcasts from the stream management page', async ({ page }, testInfo) => {
    await loginAsOwner(page);
    const suffix = projectSuffix(testInfo);
    const channelId = `managed-youtube-${suffix}`;
    const sessionTitle = `E2E ${suffix} session`;
    const occurrenceTitle = `E2E ${suffix} broadcast`;

    await page.getByRole('link', { name: 'Stream', exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard\/stream-management\?streamerId=\d+#sessions$/);
    await expect(page.getByRole('heading', { name: 'Streams & sources' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'How live broadcasts are organized' })).toBeVisible();
    await expect(page.getByText('One show across platforms', { exact: true })).toBeVisible();
    await expect(page.getByText('One broadcast on one channel', { exact: true })).toBeVisible();

    const sourceForm = page.locator('form[action="/dashboard/stream-management/sources"]');
    await expect(sourceForm).toBeVisible();
    await sourceForm.locator('select[name="provider"]').selectOption('youtube');
    await sourceForm.locator('input[name="channelId"]').fill(channelId);
    await sourceForm.getByRole('button', { name: 'Add source' }).click();
    await expect(page.getByRole('status')).toHaveText('Provider source added.');
    await expect(page.getByText(channelId, { exact: true })).toBeVisible();

    const sessionForm = page.locator('form[action="/dashboard/stream-management/sessions"]');
    await sessionForm.locator('input[name="title"]').fill(sessionTitle);
    await sessionForm.getByRole('button', { name: 'Create session' }).click();
    await expect(page.getByRole('status')).toHaveText('StreamSession created.');

    const sessionRow = page.locator('.item-list li').filter({ hasText: sessionTitle });
    await expect(sessionRow).toContainText('Scheduled');
    await sessionRow.getByRole('button', { name: 'Start session' }).click();
    await expect(page.getByRole('status')).toHaveText('StreamSession started.');

    const broadcastForm = page.locator('form[action="/dashboard/stream-management/streams"]');
    await broadcastForm.locator('select[name="sourceId"]').selectOption({ label: `YouTube · ${channelId}` });
    await broadcastForm.locator('select[name="streamSessionId"]').selectOption({ label: `${sessionTitle} · Live` });
    await broadcastForm.locator('input[name="title"]').fill(occurrenceTitle);
    await broadcastForm.locator('input[name="externalId"]').fill(`e2e-provider-${suffix}`);
    await broadcastForm.locator('select[name="status"]').selectOption('live');
    await broadcastForm.getByRole('button', { name: 'Attach broadcast' }).click();

    await expect(page.getByRole('status')).toHaveText('Provider broadcast attached to the StreamSession.');
    const occurrenceRow = page.locator('.item-list li').filter({ hasText: occurrenceTitle });
    await expect(occurrenceRow).toContainText(`YouTube · ${channelId}`);
    await expect(occurrenceRow).toContainText(`Session: ${sessionTitle}`);
    await expect(occurrenceRow).toContainText('Live');
});
