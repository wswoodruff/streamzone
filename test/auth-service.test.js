'use strict';

const Assert = require('node:assert/strict');
const Module = require('node:module');
const Test = require('node:test');

const loadService = () => {
    const originalLoad = Module._load;
    Module._load = (request, parent, isMain) => request === '@hapipal/schmervice' ? { Service: class {} } : originalLoad(request, parent, isMain);

    try {
        return require('../lib/services/auth-service');
    }
    finally {
        Module._load = originalLoad;
    }
};

Test('passwords are salted, encoded, and verifiable', async () => {
    const service = new (loadService())();
    const first = await service.hashPassword('a sufficiently long password');
    const second = await service.hashPassword('a sufficiently long password');

    Assert.notEqual(first, second);
    Assert.equal(await service.verifyPassword('a sufficiently long password', first), true);
    Assert.equal(await service.verifyPassword('not the password', first), false);
    Assert.equal(await service.verifyPassword('anything', 'invalid'), false);
});

Test('registration normalizes email and never stores the plaintext password', async () => {
    const AuthService = loadService();
    const service = new AuthService();
    let inserted;
    service.server = { models: () => ({
        User: { query: () => ({
            findOne: async () => undefined,
            insert: async (record) => (inserted = record)
        }) }
    }) };

    await service.register({ email: ' Person@Example.COM ', displayName: 'Person', password: 'a secure password' });

    Assert.equal(inserted.email, 'person@example.com');
    Assert.equal(inserted.displayName, 'Person');
    Assert.match(inserted.passwordHash, /^scrypt:/);
    Assert.equal('password' in inserted, false);
});

Test('duplicate registrations are rejected', async () => {
    const AuthService = loadService();
    const service = new AuthService();
    service.server = { models: () => ({ User: { query: () => ({ findOne: async () => ({ id: 1 }) }) } }) };

    Assert.equal(await service.register({ email: 'person@example.com', displayName: 'Person', password: 'a secure password' }), null);
});
