'use strict';

const Assert = require('node:assert/strict');
const Module = require('node:module');
const Test = require('node:test');

Test('manifest wires persistence, static assets, views, and services before the app', () => {
    const originalLoad = Module._load;
    const schwifty = { name: '@hapipal/schwifty' };
    const schmervice = { name: '@hapipal/schmervice' };
    const cookie = { name: '@hapi/cookie' };
    const inert = { name: '@hapi/inert' };
    const vision = { name: '@hapi/vision' };
    const app = { name: 'streamzone' };

    Module._load = (request, parent, isMain) => {
        if (request === '@hapipal/schwifty') return schwifty;
        if (request === '@hapipal/schmervice') return schmervice;
        if (request === '@hapi/cookie') return cookie;
        if (request === '@hapi/inert') return inert;
        if (request === '@hapi/vision') return vision;
        if (request === '../lib') return app;
        return originalLoad(request, parent, isMain);
    };

    try {
        const manifest = require('../server/manifest');
        const plugins = manifest.register.plugins;
        Assert.equal(plugins[0].plugin, schwifty);
        Assert.equal(plugins[1], schmervice);
        Assert.equal(plugins[2], cookie);
        Assert.equal(plugins[3], inert);
        Assert.equal(plugins[4], vision);
        Assert.equal(plugins[5], app);
        Assert.equal(plugins[0].options.migrateOnStart, true);
        Assert.equal(plugins[0].options.knex.client, 'better-sqlite3');
    }
    finally {
        Module._load = originalLoad;
    }
});
