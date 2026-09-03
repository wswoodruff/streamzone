'use strict';

const Hapi = require('@hapi/hapi');
const manifest = require('./server/manifest');

const createServer = async () => {
    const server = Hapi.server(manifest.server);

    await server.register(manifest.register.plugins);

    return server;
};

const start = async () => {
    const server = await createServer();

    await server.start();
    console.log(`Server running at ${server.info.uri}`);

    return server;
};

if (require.main === module) {
    start().catch((error) => {
        console.error(error);
        process.exitCode = 1;
    });
}

module.exports = { createServer, start };

