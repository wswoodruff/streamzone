'use strict';

const Fs = require('node:fs/promises');
const Path = require('node:path');
const Knex = require('knex');

const validateMappings = (mappings) => {
    if (!Array.isArray(mappings) || mappings.length === 0) {
        throw new Error('The mapping file must contain a non-empty JSON array.');
    }

    const streamerIds = new Set();
    for (const mapping of mappings) {
        if (!Number.isInteger(mapping?.streamerId) || mapping.streamerId <= 0 ||
            !Number.isInteger(mapping?.userId) || mapping.userId <= 0) {
            throw new Error('Every mapping must contain positive integer streamerId and userId values.');
        }
        if (streamerIds.has(mapping.streamerId)) {
            throw new Error(`Streamer ${mapping.streamerId} is mapped more than once.`);
        }
        streamerIds.add(mapping.streamerId);
    }
};

const bootstrapOwners = async (knex, mappings) => {
    validateMappings(mappings);

    return knex.transaction(async (transaction) => {
        const assignments = [];
        for (const { streamerId, userId } of mappings) {
            const streamer = await transaction('Streamer').where({ id: streamerId }).first();
            if (!streamer) throw new Error(`Streamer ${streamerId} does not exist.`);

            const user = await transaction('User').where({ id: userId }).first();
            if (!user) throw new Error(`User ${userId} does not exist.`);

            const memberships = await transaction('StreamerMembership').where({ streamerId });
            if (memberships.length !== 0) {
                throw new Error(`Streamer ${streamerId} already has membership data; refusing to replace it.`);
            }

            const membership = { streamerId, userId, role: 'owner' };
            await transaction('StreamerMembership').insert(membership);
            assignments.push(membership);
        }
        return assignments;
    });
};

const main = async () => {
    const mappingFile = process.argv[2];
    if (!mappingFile) throw new Error('Usage: npm run bootstrap:owners -- <mapping.json>');

    const mappings = JSON.parse(await Fs.readFile(Path.resolve(mappingFile), 'utf8'));
    const knex = Knex({
        client: 'better-sqlite3',
        connection: { filename: process.env.DATABASE_FILE || Path.join(process.cwd(), 'streamzone.sqlite') },
        useNullAsDefault: true
    });

    try {
        const assignments = await bootstrapOwners(knex, mappings);
        console.log(`Assigned ${assignments.length} legacy streamer owner(s).`);
    }
    finally {
        await knex.destroy();
    }
};

if (require.main === module) {
    main().catch((error) => {
        console.error(error.message);
        process.exitCode = 1;
    });
}

module.exports = { bootstrapOwners, validateMappings };
