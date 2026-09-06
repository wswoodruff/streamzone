'use strict';

process.env.HOST = process.env.TEST_CONSOLE_HOST || '127.0.0.1';
process.env.PORT = process.env.TEST_CONSOLE_PORT || '3010';

const TestConsoleRuntime = require('./runtime');
const ConsoleAiProvider = require('./mock-ai-provider');

const errorResponse = (handler) => async (request, h) => {
    try {
        return await handler(request, h);
    }
    catch (error) {
        const statusCode = Number(error.httpStatus || 400);
        return h.response({
            error: {
                code: error.code || 'TEST_CONSOLE_ERROR',
                message: error.message || 'Test console request failed.'
            }
        }).code(statusCode >= 400 && statusCode <= 599 ? statusCode : 400);
    }
};

const start = async () => {
    const { createServer } = require('../../server');
    const server = await createServer();
    server.app.aiProvider = new ConsoleAiProvider();
    const runtime = new TestConsoleRuntime(server);

    server.route([
        {
            method: 'GET',
            path: '/__test-console/health',
            handler: () => ({ ok: true, mockAiProvider: true })
        },
        {
            method: 'GET',
            path: '/__test-console/bootstrap',
            handler: errorResponse(() => runtime.bootstrap())
        },
        {
            method: 'POST',
            path: '/__test-console/clients',
            handler: errorResponse((request) => runtime.attach(request.payload || {}))
        },
        {
            method: 'GET',
            path: '/__test-console/clients/{clientId}',
            handler: errorResponse((request) => runtime.status(request.params.clientId))
        },
        {
            method: 'POST',
            path: '/__test-console/clients/{clientId}/messages',
            handler: errorResponse((request) => runtime.message(request.params.clientId, request.payload?.text))
        },
        {
            method: 'POST',
            path: '/__test-console/clients/{clientId}/points',
            handler: errorResponse((request) => runtime.adjustPoints(request.params.clientId, request.payload?.amount))
        },
        {
            method: 'PUT',
            path: '/__test-console/clients/{clientId}/ai',
            handler: errorResponse((request) => runtime.configureAi(request.params.clientId, request.payload || {}))
        }
    ]);

    await server.start();
    console.log(`Streamzone test-console host: ${server.info.uri}`);
    console.log('Mock AI provider: enabled (console only)');
    console.log('Open additional terminals and run: npm run console');

    const shutdown = async () => {
        await server.stop();
        process.exit(0);
    };
    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);
    return server;
};

if (require.main === module) {
    start().catch((error) => {
        console.error(error);
        process.exitCode = 1;
    });
}

module.exports = { start };
