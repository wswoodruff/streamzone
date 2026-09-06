'use strict';

const Assert = require('node:assert/strict');
const Module = require('node:module');
const Test = require('node:test');

const loadService = () => {
    const originalLoad = Module._load;
    Module._load = (request, parent, isMain) => request === '@hapipal/schmervice' ? { Service: class {} } : originalLoad(request, parent, isMain);

    try {
        return require('../lib/services/authorization-service');
    }
    finally {
        Module._load = originalLoad;
    }
};

Test('role matrix grants each role only its centralized capabilities', () => {
    const service = new (loadService())();
    const allCapabilities = [
        'readManagement', 'manageSources', 'manageStreams', 'manageCommands',
        'manageMemberships', 'deleteStreamer', 'transferOwnership'
    ];
    const expected = {
        owner: allCapabilities,
        admin: allCapabilities.slice(0, 5),
        editor: allCapabilities.slice(0, 4),
        viewer: ['readManagement']
    };

    for (const [role, allowed] of Object.entries(expected)) {
        for (const capability of allCapabilities) {
            Assert.equal(service.can(role, capability), allowed.includes(capability), `${role}: ${capability}`);
        }
    }

    Assert.equal(service.can('unknown', 'readManagement'), false);
    Assert.equal(service.can('owner', 'unknownCapability'), false);
});

Test('admins cannot manage an owner membership', () => {
    const Service = loadService();
    const service = new Service();

    Assert.throws(
        () => service.assertCanManageRole('admin', 'owner'),
        (error) => error instanceof Service.AuthorizationError && error.code === 'FORBIDDEN'
    );
    Assert.doesNotThrow(() => service.assertCanManageRole('admin', 'editor'));
    Assert.throws(() => service.assertCanManageRole('admin', 'admin'), { code: 'FORBIDDEN' });
    Assert.throws(() => service.assertCanManageRole('editor', 'editor'), { code: 'FORBIDDEN' });
    Assert.doesNotThrow(() => service.assertCanManageRole('owner', 'owner'));
});

Test('the final owner cannot be deleted or demoted', async () => {
    const Service = loadService();
    const service = new Service();
    const oneOwnerModel = {
        query: () => ({
            where: () => ({ forUpdate: async () => [{ userId: 1, role: 'owner' }] })
        })
    };

    await Assert.rejects(
        service.assertOwnerRemains(oneOwnerModel, {}, 10, 'owner', 'admin'),
        (error) => error instanceof Service.AuthorizationError && error.code === 'FINAL_OWNER'
    );
    await Assert.rejects(
        service.assertOwnerRemains(oneOwnerModel, {}, 10, 'owner', null),
        { code: 'FINAL_OWNER' }
    );
});

Test('an owner may change when another owner remains', async () => {
    const service = new (loadService())();
    let locked = false;
    const model = {
        query: () => ({
            where: () => ({
                forUpdate: async () => {
                    locked = true;
                    return [{ userId: 1 }, { userId: 2 }];
                }
            })
        })
    };

    await service.assertOwnerRemains(model, {}, 10, 'owner', 'viewer');
    Assert.equal(locked, true);
});

Test('membership additions run inside a transaction', async () => {
    const service = new (loadService())();
    const transaction = { id: 'transaction' };
    let transactionUsed = false;
    let inserted;
    const StreamerMembership = {
        transaction: async (operation) => {
            transactionUsed = true;
            return operation(transaction);
        },
        query: (receivedTransaction) => {
            Assert.equal(receivedTransaction, transaction);
            return {
                findOne: async () => ({ role: 'owner' }),
                insert: async (record) => (inserted = record)
            };
        }
    };
    service.server = { models: () => ({ StreamerMembership }) };

    await service.addMembership(1, 9, { userId: 2, role: 'editor' });

    Assert.equal(transactionUsed, true);
    Assert.deepEqual(inserted, { userId: 2, streamerId: 9, role: 'editor' });
});

Test('non-members receive a not-found error without a resource existence disclosure', async () => {
    const Service = loadService();
    const service = new Service();
    service.server = { models: () => ({
        StreamerMembership: { query: () => ({ findOne: async () => undefined }) }
    }) };

    await Assert.rejects(
        service.requireCapability(8, 99, 'readManagement'),
        (error) => error instanceof Service.ResourceNotFoundError && error.code === 'NOT_FOUND'
    );
});

Test('members lacking a capability receive a forbidden error', async () => {
    const Service = loadService();
    const service = new Service();
    service.server = { models: () => ({
        StreamerMembership: { query: () => ({ findOne: async () => ({ role: 'viewer' }) }) }
    }) };

    await Assert.rejects(
        service.requireCapability(8, 9, 'manageStreams'),
        (error) => error instanceof Service.AuthorizationError && error.code === 'FORBIDDEN'
    );
});
