'use strict';

const Path = require('node:path');
const Schmervice = require('@hapipal/schmervice');
const Schwifty = require('@hapipal/schwifty');
const Cookie = require('@hapi/cookie');
const Vision = require('@hapi/vision');
const App = require('../lib');
const InProcessRuntimeState = require('../lib/runtime-state/in-process-runtime-state');

const databaseFilename = process.env.DATABASE_FILE || Path.join(process.cwd(), 'streamzone.sqlite');

module.exports = {
    server: {
        address: process.env.HOST || '0.0.0.0',
        port: Number(process.env.PORT) || 3000,
        routes: {
            cors: true
        }
    },
    register: {
        plugins: [
            {
                plugin: Schwifty,
                options: {
                    knex: {
                        client: 'better-sqlite3',
                        connection: { filename: databaseFilename },
                        useNullAsDefault: true
                    },
                    migrationsDir: Path.join(__dirname, '..', 'migrations'),
                    migrateOnStart: true
                }
            },
            Schmervice,
            Cookie,
            Vision,
            App
        ]
    }
};

// Runtime state is deliberately outside the persistence models. A deployment can
// replace this instance with a Redis-backed RuntimeState without changing executors.
module.exports.server.app = { runtimeState: new InProcessRuntimeState() };
