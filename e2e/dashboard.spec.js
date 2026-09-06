'use strict';

const { expect, loginAsOwner, test } = require('./fixtures');

test('dashboard requires an authenticated session', async ({ page }) => {
    await page.goto('/dashboard');

    await expect(page).toHaveURL(/\/login\?next=/);
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
});

test('owner signs in, sees seeded management state, and signs out', async ({ page }) => {
    await loginAsOwner(page);

    await expect(page.getByRole('heading', { name: 'Hosted creators' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Aurora Live' })).toBeVisible();
    await expect(page.getByText('@aurora-live · 2 sources')).toBeVisible();

    const rows = page.locator('tbody tr');
    await expect(rows).toHaveCount(2);
    await expect(rows).toContainText(['Sunday Launch Show', 'Sunday Launch Show']);
    await expect(page.getByRole('cell', { name: 'twitch', exact: true })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'youtube', exact: true })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'live', exact: true })).toHaveCount(2);

    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/$/);

    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login\?next=/);
});
