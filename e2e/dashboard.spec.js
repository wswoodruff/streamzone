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
