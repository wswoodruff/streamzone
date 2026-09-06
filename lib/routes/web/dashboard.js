'use strict';

const Joi = require('@hapi/joi');
const { ResourceNotFoundError } = require('../../services/authorization-service');
const id = require('../../validation/ids');

module.exports = {
    method: 'GET',
    path: '/dashboard',
    options: {
        auth: 'session',
        validate: {
            query: Joi.object({ streamerId: id })
        }
    },
    handler: async (request, h) => {
        const user = request.auth.credentials;

        try {
            const dashboard = await request.services().dashboardService.overview(user.id, request.query.streamerId);
            return h.view('dashboard', { title: 'Dashboard', user, ...dashboard });
        }
        catch (error) {
            if (error instanceof ResourceNotFoundError) {
                return h.response('Streamer not found').code(404);
            }

            throw error;
        }
    }
};
