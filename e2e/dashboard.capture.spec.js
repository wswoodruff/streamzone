'use strict';

const Fs = require('node:fs/promises');
const Path = require('node:path');
const { loginAsOwner, test } = require('./fixtures');

const filenames = {
    desktop: {
        dashboard: 'owner-dashboard-desktop.png',
        commands: 'command-management-desktop.png',
        team: 'team-invitations-desktop.png',
        rewards: 'rewards-points-desktop.png',
        ai: 'rewards-ai-desktop.png',
        streams: 'streams-sessions-desktop.png'
    },
    mobile: {
        dashboard: 'owner-dashboard-mobile.png',
        commands: 'command-management-mobile.png',
        team: 'team-invitations-mobile.png',
        rewards: 'rewards-points-mobile.png',
        ai: 'rewards-ai-mobile.png',
        streams: 'streams-sessions-mobile.png'
    }
};

const screenshot = async (locator, path) => locator.screenshot({
    path,
    animations: 'disabled',
    caret: 'hide'
});

test('capture integrated owner management surfaces', async ({ page }, testInfo) => {
    await loginAsOwner(page);
    await page.evaluate(() => document.fonts.ready);

    const outputDirectory = Path.join(process.cwd(), 'artifacts', 'ui');
    const names = filenames[testInfo.project.name];
    await Fs.mkdir(outputDirectory, { recursive: true });

    await page.screenshot({
        path: Path.join(outputDirectory, names.dashboard),
        fullPage: true,
        animations: 'disabled',
        caret: 'hide'
    });
    await screenshot(page.locator('#commands'), Path.join(outputDirectory, names.commands));
    await screenshot(page.locator('#team'), Path.join(outputDirectory, names.team));
    await screenshot(page.locator('#rewards'), Path.join(outputDirectory, names.rewards));
    await screenshot(page.locator('#ai'), Path.join(outputDirectory, names.ai));

    await page.getByRole('link', { name: 'Stream', exact: true }).click();
    await page.waitForURL(/\/dashboard\/stream-management\?streamerId=\d+#sessions$/);
    await page.evaluate(() => document.fonts.ready);
    await screenshot(page.locator('.management-content'), Path.join(outputDirectory, names.streams));
});
