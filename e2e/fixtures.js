'use strict';

const { test: base, expect } = require('@playwright/test');

const OWNER = {
    email: 'owner@streamzone.test',
    password: 'streamzone-owner-password'
};

const test = base.extend({
    page: async ({ page }, use) => {
        const errors = [];

        page.on('console', (message) => {
            if (message.type() === 'error') errors.push(`console.error: ${message.text()}`);
        });
        page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));

        await use(page);

        expect(errors, 'The page emitted browser errors.').toEqual([]);
    }
});

const loginAsOwner = async (page) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();

    await page.getByLabel('Email').fill(OWNER.email);
    await page.getByLabel('Password').fill(OWNER.password);
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole('heading', { name: 'Hello, Morgan Streamer.' })).toBeVisible();
};

module.exports = { expect, loginAsOwner, test };
