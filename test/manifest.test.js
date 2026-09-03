'use strict';

const Assert = require('node:assert/strict');
const Module = require('node:module');
const Test = require('node:test');

Test('manifest wires the streaming platform persistence and service plugins before the app', () => {
    const originalLoad = Module._load;
    const schwifty = { name: '@hapipal/schwifty' };
    const schmervice = { name: '@hapipal/schmervice' };
    const app = { name: 'streamzone' };

    Module._load = (request, parent, isMain) => {
        if (request === '@hapipal/schwifty') {
            return schwifty;
        }

        if (request === '@hapipal/schmervice') {
            return schmervice;
        }

        if (request === '../lib') {
            return app;
        }

        return originalLoad(request, parent, isMain);
    };

    try {
        const manifest = require('../server/manifest');
        const plugins = manifest.register.plugins;

        Assert.equal(plugins[0].plugin, schwifty);
        Assert.equal(plugins[1], schmervice);
        Assert.equal(plugins[2], app);
        Assert.equal(plugins[0].options.migrateOnStart, true);
        Assert.equal(plugins[0].options.knex.client, 'better-sqlite3');
    }
    finally {
        Module._load = originalLoad;
    }
});
