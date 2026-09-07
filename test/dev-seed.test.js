'use strict';

const Assert = require('node:assert/strict');
const ChildProcess = require('node:child_process');
const Fs = require('node:fs');
const Os = require('node:os');
const Path = require('node:path');
const Test = require('node:test');

Test('development seed refuses to run in production before touching the database', () => {
    const directory = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'streamzone-seed-refusal-'));
    const database = Path.join(directory, 'must-not-exist.sqlite');
    const result = ChildProcess.spawnSync(process.execPath, ['tools/dev-seed.js'], {
        cwd: Path.join(__dirname, '..'), encoding: 'utf8',
        env: { ...process.env, NODE_ENV: 'production', DATABASE_FILE: database }
    });

    Assert.notEqual(result.status, 0);
    Assert.match(result.stderr, /Refusing to seed development data when NODE_ENV=production/);
    Assert.equal(Fs.existsSync(database), false);
    Fs.rmSync(directory, { recursive: true, force: true });
});
