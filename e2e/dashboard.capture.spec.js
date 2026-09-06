'use strict';

const Fs = require('node:fs/promises');
const Path = require('node:path');
const { loginAsOwner, test } = require('./fixtures');

const filenames = {
    desktop: 'owner-dashboard-desktop.png',
    mobile: 'owner-dashboard-mobile.png'
};

test('capture owner dashboard', async ({ page }, testInfo) => {
    await loginAsOwner(page);
    await page.evaluate(() => document.fonts.ready);

    const outputDirectory = Path.join(process.cwd(), 'artifacts', 'ui');
    await Fs.mkdir(outputDirectory, { recursive: true });
    await page.screenshot({
        path: Path.join(outputDirectory, filenames[testInfo.project.name]),
        fullPage: true,
        animations: 'disabled',
        caret: 'hide'
    });
});
