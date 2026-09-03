'use strict';

const HauteCouture = require('@hapipal/haute-couture');

exports.plugin = {
    name: 'streamzone',
    version: '1.0.0',
    dependencies: ['@hapipal/schwifty', '@hapipal/schmervice'],
    register: async (server, options) => {
        await HauteCouture.compose(server, options);
    }
};

