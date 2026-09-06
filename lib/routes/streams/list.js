'use strict';

const Joi = require('@hapi/joi');
const { status } = require('../../validation/streams');

module.exports = {
    method: 'GET',
    path: '/streams',
    options: { validate: { query: Joi.object({ status }) } },
    handler: (request) => request.services().streamingService.listPublicStreams(request.query.status)
};
