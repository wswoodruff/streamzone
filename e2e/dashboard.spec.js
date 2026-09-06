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
