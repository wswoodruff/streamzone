'use strict';

const { ResourceNotFoundError } = require('../../services/authorization-service');
const { query } = require('../../validation/stream-management');

module.exports = {
    method: 'GET',
    path: '/dashboard/stream-management',
    options: {
        auth: 'session',
        validate: { query }
    },
    handler: async (request, h) => {
        const user = request.auth.credentials;

        try {
            const management = await request.services().streamManagementService.overview(user.id, request.query.streamerId);
            return h.view('stream-management', {
                title: 'Streams & Sources',
                user,
                notice: request.query.notice,
                error: request.query.error,
                ...management
            });
        }
        catch (error) {
            if (error instanceof ResourceNotFoundError) return h.response('Streamer not found').code(404);
            throw error;
        }
    }
};
