'use strict';

const Path = require('node:path');
const Schmervice = require('@hapipal/schmervice');
const Schwifty = require('@hapipal/schwifty');
const App = require('../lib');

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
            App
        ]
    }
};

