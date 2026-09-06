'use strict';

// SQLite treats identifiers that differ only by case as the same name. Each
// rename therefore uses a distinct intermediate name rather than attempting a
// direct (for example, `users` -> `User`) case-only rename. Modern SQLite also
// rewrites foreign-key targets during ALTER TABLE RENAME while foreign key
// enforcement remains enabled.
const renameCaseSafely = async (knex, from, to) => {
    const intermediate = `__streamzone_rename_${to}`;

    await knex.schema.renameTable(from, intermediate);
    await knex.schema.renameTable(intermediate, to);
};

exports.up = async (knex) => {
    // Rename dependent tables before the tables they reference.
    await renameCaseSafely(knex, 'sessions', 'Session');
    await renameCaseSafely(knex, 'streams', 'Stream');
    await renameCaseSafely(knex, 'commands', 'Command');
    await renameCaseSafely(knex, 'sources', 'Source');
    await renameCaseSafely(knex, 'users', 'User');
    await renameCaseSafely(knex, 'streamers', 'Streamer');
};

exports.down = async (knex) => {
    // Use the same child-before-parent ordering when restoring legacy names.
    await renameCaseSafely(knex, 'Session', 'sessions');
    await renameCaseSafely(knex, 'Stream', 'streams');
    await renameCaseSafely(knex, 'Command', 'commands');
    await renameCaseSafely(knex, 'Source', 'sources');
    await renameCaseSafely(knex, 'User', 'users');
    await renameCaseSafely(knex, 'Streamer', 'streamers');
};
