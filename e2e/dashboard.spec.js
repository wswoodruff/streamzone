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

test('owner manages invitations and standalone AI from the dashboard', async ({ page }) => {
    await loginAsOwner(page);

    await expect(page.getByRole('heading', { name: 'Management team' })).toBeVisible();
    await expect(page.getByText('Taylor Editor', { exact: true })).toBeVisible();
    await expect(page.getByText('pending.e2e@example.com', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Rewards & points' })).toBeVisible();
    await expect(page.getByText('Hydrate', { exact: true })).toBeVisible();
    await expect(page.getByText('Watch time', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Standalone AI' })).toBeVisible();
    await expect(page.getByText('!ask', { exact: true })).toBeVisible();
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
    await expect(page.getByText('!askbot', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Invocation command')).toHaveValue('askbot');

    await page.getByText('Create instruction draft', { exact: true }).click();
    await page.getByLabel('Streamer instruction').fill('Answer channel questions with concise, relevant context.');
    await page.getByRole('button', { name: 'Create draft' }).click();
    await expect(page.getByRole('status')).toContainText('AI instruction draft created');
    await expect(page.getByText('Answer channel questions with concise, relevant context.', { exact: true })).toBeVisible();
});
