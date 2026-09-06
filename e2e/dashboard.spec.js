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
    await expect(page.getByText('!schedule', { exact: true })).toBeVisible();
    await expect(page.getByText('Moderator · 15s session', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/$/);

    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login\?next=/);
});

test('owner manages Sources, StreamSessions, and provider broadcasts from the stream management page', async ({ page }) => {
    await loginAsOwner(page);

    await page.getByRole('link', { name: 'Stream', exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard\/stream-management\?streamerId=\d+#sessions$/);
    await expect(page.getByRole('heading', { name: 'Streams & sources' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Two related records, two jobs' })).toBeVisible();
    await expect(page.getByText('Streamzone runtime window', { exact: true })).toBeVisible();
    await expect(page.getByText('One occurrence on one Source', { exact: true })).toBeVisible();

    await page.getByLabel('Provider', { exact: true }).selectOption('youtube');
    await page.getByLabel('Provider channel ID').fill('managed-youtube-channel');
    await page.getByRole('button', { name: 'Add source' }).click();
    await expect(page.getByRole('status')).toHaveText('Provider source added.');
    await expect(page.getByText('managed-youtube-channel', { exact: true })).toBeVisible();

    await page.getByLabel('Session title').fill('E2E managed session');
    await page.getByRole('button', { name: 'Create session' }).click();
    await expect(page.getByRole('status')).toHaveText('StreamSession created.');

    const sessionRow = page.locator('.item-list li').filter({ hasText: 'E2E managed session' });
    await expect(sessionRow).toContainText('Scheduled');
    await sessionRow.getByRole('button', { name: 'Start session' }).click();
    await expect(page.getByRole('status')).toHaveText('StreamSession started.');

    await page.getByLabel('Source', { exact: true }).selectOption({ label: 'YouTube · managed-youtube-channel' });
    await page.getByLabel('StreamSession', { exact: true }).selectOption({ label: 'E2E managed session · Live' });
    await page.getByLabel('Broadcast title (optional)').fill('E2E provider occurrence');
    await page.getByLabel('Provider broadcast ID (optional)').fill('e2e-provider-id');
    await page.getByLabel('State', { exact: true }).selectOption('live');
    await page.getByRole('button', { name: 'Attach broadcast' }).click();

    await expect(page.getByRole('status')).toHaveText('Provider broadcast attached to the StreamSession.');
    const occurrenceRow = page.locator('.item-list li').filter({ hasText: 'E2E provider occurrence' });
    await expect(occurrenceRow).toContainText('YouTube · managed-youtube-channel');
    await expect(occurrenceRow).toContainText('StreamSession: E2E managed session');
    await expect(occurrenceRow).toContainText('Live');
});
