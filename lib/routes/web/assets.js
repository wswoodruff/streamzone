'use strict';

const Path = require('node:path');

module.exports = {
    method: 'GET',
    path: '/assets/{param*}',
    options: { auth: false },
    handler: {
        directory: {
            path: Path.join(__dirname, '..', '..', '..', 'public'),
            index: false,
            listing: false
        }
    }
};
