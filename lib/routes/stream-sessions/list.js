'use strict';

const ManagementResponse = require('../../http/management-response');
const Joi = require('@hapi/joi');
const id = require('../../validation/ids');

module.exports = {
    method: 'GET',
    path: '/streamers/{streamerId}/stream-sessions',
    options: { auth: 'session', validate: { params: Joi.object({ streamerId: id.required() }) } },
    handler: async (request, h) => {
        try {
            return await request.services().streamingService.listStreamSessions(
                request.auth.credentials.id,
                request.params.streamerId,
                'readManagement'
            );
        }
        catch (error) {
            return ManagementResponse.fromError(error, h);
        }
    }
};
