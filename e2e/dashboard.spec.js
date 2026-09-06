'use strict';

const { expect, loginAsOwner, test } = require('./fixtures');

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
    await expect(page.getByText('Sunday Launch Show', { exact: true })).toBeVisible();
    await expect(page.getByText('Twitch', { exact: true })).toBeVisible();
    await expect(page.getByText('YouTube', { exact: true })).toBeVisible();
    await expect(page.locator('#commands').getByRole('heading', { name: '!schedule' })).toBeVisible();
    await expect(page.getByText('Moderator · 15s session', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/$/);

    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login\?next=/);
});

test('owner manages invitations and standalone AI from the dashboard', async ({ page }) => {
    await loginAsOwner(page);

    await expect(page.getByRole('heading', { name: 'Management team' })).toBeVisible();
    await expect(page.getByText('Taylor Editor', { exact: true })).toBeVisible();
    await expect(page.getByText('pending.e2e@example.com', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Rewards & points' })).toBeVisible();
    await expect(page.getByText('Hydrate', { exact: true })).toBeVisible();
    await expect(page.getByText('Watch time', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Standalone AI' })).toBeVisible();
    await expect(page.locator('#ai').getByRole('heading', { name: '!ask' })).toBeVisible();
    await expect(page.getByText('Streamer instructions', { exact: true })).toBeVisible();

    const rewardTypes = await page.locator('select[name="fulfillmentType"] option').allTextContents();
    expect(rewardTypes).toEqual(['Manual', 'Deterministic bot']);

    const inviteGroup = page.getByRole('group', { name: 'Invite a team member' });
    await inviteGroup.getByLabel('Email address').fill('playwright-invite@example.com');
    await inviteGroup.getByLabel('Role').selectOption('editor');
    await page.getByRole('button', { name: 'Create invitation' }).click();
    await expect(page.getByRole('status')).toContainText('Invitation created');
    await expect(page.getByText('playwright-invite@example.com', { exact: true })).toBeVisible();

    const aiForm = page.locator('form[action="/dashboard/ai"]');
    await aiForm.getByLabel('Invocation command').fill('askbot');
    await aiForm.getByLabel('Point cost').fill('30');
    await page.getByRole('button', { name: 'Save AI configuration' }).click();
    await expect(page.getByRole('status')).toContainText('Standalone AI configuration updated');
    await expect(page.locator('#ai').getByRole('heading', { name: '!askbot' })).toBeVisible();
    await expect(aiForm.getByLabel('Invocation command')).toHaveValue('askbot');

    await page.getByText('Create instruction draft', { exact: true }).click();
    await page.getByLabel('Streamer instruction').fill('Answer channel questions with concise, relevant context.');
    await page.getByRole('button', { name: 'Create draft' }).click();
    await expect(page.getByRole('status')).toContainText('AI instruction draft created');
    await expect(page.getByText('Answer channel questions with concise, relevant context.', { exact: true })).toBeVisible();
});

test('owner creates, edits, disables, and deletes a command', async ({ page }) => {
    await loginAsOwner(page);
    const commands = page.locator('#commands');
    const createForm = commands.getByRole('form', { name: 'Create command' });

    await createForm.getByLabel('Command name').fill('rules');
    await createForm.getByLabel('Response template').fill('Read the rules before chatting.');
    await createForm.getByLabel('Cooldown seconds').fill('30');
    await createForm.getByLabel('Cooldown scope').selectOption('participant');
    await createForm.getByLabel('Required chat role').selectOption('supermod');
    await createForm.getByRole('button', { name: 'Create command' }).click();

    await expect(commands.getByRole('status')).toHaveText('Command created.');
    let card = commands.locator('[data-command-name="rules"]');
    await expect(card).toContainText('Supermod · 30s participant');
    await expect(card).toContainText('Read the rules before chatting.');

    await card.locator('.command-editor summary').click();
    const editForm = card.getByRole('form', { name: 'Edit !rules command' });
    await editForm.getByLabel('Response template').fill('Updated rules response.');
    await editForm.getByLabel('Cooldown seconds').fill('5');
    await editForm.getByLabel('Cooldown scope').selectOption('session');
    await editForm.getByLabel('Required chat role').selectOption('owner');
    await editForm.getByRole('button', { name: 'Save changes' }).click();

    await expect(commands.getByRole('status')).toHaveText('Command updated.');
    card = commands.locator('[data-command-name="rules"]');
    await expect(card).toContainText('Owner · 5s session');
    await expect(card).toContainText('Updated rules response.');

    await card.getByRole('button', { name: 'Disable' }).click();
    await expect(commands.getByRole('status')).toHaveText('Command disabled.');
    card = commands.locator('[data-command-name="rules"]');
    await expect(card.getByText('Disabled', { exact: true })).toBeVisible();
    await expect(card.getByRole('button', { name: 'Enable' })).toBeVisible();

    await card.locator('.delete-confirm summary').click();
    await card.getByRole('button', { name: 'Delete command' }).click();
    await expect(commands.getByRole('status')).toHaveText('Command deleted.');
    await expect(commands.locator('[data-command-name="rules"]')).toHaveCount(0);
});

test('owner manages Sources, StreamSessions, and provider broadcasts from the stream management page', async ({ page }) => {
    await loginAsOwner(page);

    await page.getByRole('link', { name: 'Stream', exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard\/stream-management\?streamerId=\d+#sessions$/);
    await expect(page.getByRole('heading', { name: 'Streams & sources' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'How live broadcasts are organized' })).toBeVisible();
    await expect(page.getByText('One show across platforms', { exact: true })).toBeVisible();
    await expect(page.getByText('One broadcast on one channel', { exact: true })).toBeVisible();

    const sourceForm = page.locator('form[action="/dashboard/stream-management/sources"]');
    await expect(sourceForm).toBeVisible();
    await sourceForm.locator('select[name="provider"]').selectOption('youtube');
    await sourceForm.locator('input[name="channelId"]').fill('managed-youtube-channel');
    await sourceForm.getByRole('button', { name: 'Add source' }).click();
    await expect(page.getByRole('status')).toHaveText('Provider source added.');
    await expect(page.getByText('managed-youtube-channel', { exact: true })).toBeVisible();

    const sessionForm = page.locator('form[action="/dashboard/stream-management/sessions"]');
    await sessionForm.locator('input[name="title"]').fill('E2E managed session');
    await sessionForm.getByRole('button', { name: 'Create session' }).click();
    await expect(page.getByRole('status')).toHaveText('StreamSession created.');

    const sessionRow = page.locator('.item-list li').filter({ hasText: 'E2E managed session' });
    await expect(sessionRow).toContainText('Scheduled');
    await sessionRow.getByRole('button', { name: 'Start session' }).click();
    await expect(page.getByRole('status')).toHaveText('StreamSession started.');

    const broadcastForm = page.locator('form[action="/dashboard/stream-management/streams"]');
    await broadcastForm.locator('select[name="sourceId"]').selectOption({ label: 'YouTube · managed-youtube-channel' });
    await broadcastForm.locator('select[name="streamSessionId"]').selectOption({ label: 'E2E managed session · Live' });
    await broadcastForm.locator('input[name="title"]').fill('E2E provider occurrence');
    await broadcastForm.locator('input[name="externalId"]').fill('e2e-provider-id');
    await broadcastForm.locator('select[name="status"]').selectOption('live');
    await broadcastForm.getByRole('button', { name: 'Attach broadcast' }).click();

    await expect(page.getByRole('status')).toHaveText('Provider broadcast attached to the StreamSession.');
    const occurrenceRow = page.locator('.item-list li').filter({ hasText: 'E2E provider occurrence' });
    await expect(occurrenceRow).toContainText('YouTube · managed-youtube-channel');
    await expect(occurrenceRow).toContainText('Session: E2E managed session');
    await expect(occurrenceRow).toContainText('Live');
});
