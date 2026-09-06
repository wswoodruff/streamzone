'use strict';

const Assert = require('node:assert/strict');
const Fs = require('node:fs');
const Module = require('node:module');
const Path = require('node:path');
const Test = require('node:test');

const expectedRoutes = [
    ['GET', '/'],
    ['GET', '/dashboard'],
    ['GET', '/login'],
    ['POST', '/login'],
    ['POST', '/logout'],
    ['GET', '/register'],
    ['POST', '/register'],
    ['GET', '/streamers'],
    ['POST', '/streamers'],
    ['PATCH', '/streamers/{streamerId}'],
    ['DELETE', '/streamers/{streamerId}'],
    ['GET', '/streamers/{streamerId}/memberships'],
    ['PATCH', '/streamers/{streamerId}/memberships/{userId}'],
    ['DELETE', '/streamers/{streamerId}/memberships/{userId}'],
    ['POST', '/streamers/{streamerId}/invitations'],
    ['GET', '/streamers/{streamerId}/invitations'],
    ['DELETE', '/streamers/{streamerId}/invitations/{invitationId}'],
    ['POST', '/invitations/accept'],
    ['POST', '/streamers/{streamerId}/sources'],
    ['GET', '/streamers/{streamerId}/commands'],
    ['POST', '/streamers/{streamerId}/commands'],
    ['PATCH', '/streamers/{streamerId}/commands/{commandId}'],
    ['DELETE', '/streamers/{streamerId}/commands/{commandId}'],
    ['GET', '/streamers/{streamerId}/instructions'],
    ['POST', '/streamers/{streamerId}/instructions'],
    ['PATCH', '/streamers/{streamerId}/instructions/{versionId}'],
    ['POST', '/streamers/{streamerId}/instructions/{versionId}/validation'],
    ['POST', '/streamers/{streamerId}/instructions/{versionId}/warning-acknowledgement'],
    ['POST', '/streamers/{streamerId}/instructions/{versionId}/publication'],
    ['POST', '/streamers/{streamerId}/instructions/{versionId}/rollback'],
    ['GET', '/streams'],
    ['POST', '/streams'],
    ['PATCH', '/streams/{streamId}'],
    ['DELETE', '/streams/{streamId}'],
    ['GET', '/streamers/{streamerId}/rewards'],
    ['POST', '/streamers/{streamerId}/rewards'],
    ['PATCH', '/streamers/{streamerId}/rewards/{rewardId}'],
    ['POST', '/streamers/{streamerId}/redemptions/{redemptionId}/fulfill'],
    ['GET', '/participants/streamers/{streamerId}/balance'],
    ['GET', '/participants/streamers/{streamerId}/rewards'],
    ['GET', '/participants/streamers/{streamerId}/redemptions'],
    ['POST', '/participants/streamers/{streamerId}/redemptions'],
    ['GET', '/participants/streamers/{streamerId}/redemptions/{redemptionId}']
];

const joiSchema = new Proxy(() => joiSchema, {
    apply: () => joiSchema,
    get: () => joiSchema
});

const routeFiles = (directory) => Fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const filename = Path.join(directory, entry.name);
    return entry.isDirectory() ? routeFiles(filename) : entry.name.endsWith('.js') ? [filename] : [];
});

Test('Haute Couture composition registers every nested route exactly once', async () => {
    const originalLoad = Module._load;
    const registered = [];
    let composeCalls = 0;

    Module._load = (request, parent, isMain) => {
        if (request === '@hapi/joi') {
            return joiSchema;
        }

        if (request === 'handlebars') {
            return {};
        }

        if (request === '@hapipal/haute-couture') {
            return {
                compose: async (server) => {
                    ++composeCalls;
                    for (const filename of routeFiles(Path.join(__dirname, '..', 'lib', 'routes'))) {
                        server.route(require(filename));
                    }
                }
            };
        }

        return originalLoad(request, parent, isMain);
    };

    try {
        delete require.cache[require.resolve('../lib')];
        const app = require('../lib');
        const server = {
            views: () => undefined,
            auth: { strategy: () => undefined },
            route: (definition) => registered.push([definition.method, definition.path])
        };

        await app.plugin.register(server, {});

        Assert.equal(composeCalls, 1);
        Assert.equal(registered.length, expectedRoutes.length);
        for (const route of expectedRoutes) {
            Assert.equal(registered.filter((registeredRoute) => registeredRoute[0] === route[0] && registeredRoute[1] === route[1]).length, 1, `${route.join(' ')} should be registered exactly once`);
        }
    }
    finally {
        Module._load = originalLoad;
        delete require.cache[require.resolve('../lib')];
    }
});
