'use strict';

const Assert = require('node:assert/strict');
const Module = require('node:module');
const Test = require('node:test');

const loadBootstrap = () => {
    const originalLoad = Module._load;
    Module._load = (request, parent, isMain) => request === 'knex' ? () => {} : originalLoad(request, parent, isMain);
    try { return require('../scripts/bootstrap-streamer-owners'); }
    finally { Module._load = originalLoad; }
};

Test('legacy owner mappings require deterministic positive IDs', () => {
    const { validateMappings } = loadBootstrap();
    Assert.doesNotThrow(() => validateMappings([{ streamerId: 20, userId: 10 }]));
    Assert.throws(() => validateMappings([{ streamerId: 20, userId: 10 }, { streamerId: 20, userId: 11 }]), /mapped more than once/);
    Assert.throws(() => validateMappings([{ streamerId: 20, userId: 'owner@example.com' }]), /positive integer/);
});
