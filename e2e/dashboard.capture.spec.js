'use strict';

const Fs = require('node:fs/promises');
const Path = require('node:path');
const { loginAsOwner, test } = require('./fixtures');

const filenames = {
    desktop: {
        dashboard: 'owner-dashboard-desktop.png',
        commands: 'command-management-desktop.png'
    },
    mobile: {
        dashboard: 'owner-dashboard-mobile.png',
        commands: 'command-management-mobile.png'
    }
};

test('capture owner dashboard and command management', async ({ page }, testInfo) => {
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
    await page.locator('#commands').screenshot({
        path: Path.join(outputDirectory, names.commands),
        animations: 'disabled',
        caret: 'hide'
    });
});
