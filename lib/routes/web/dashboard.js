'use strict';

const Joi = require('@hapi/joi');
const DashboardActionResponse = require('../../http/dashboard-action-response');
const { ResourceNotFoundError } = require('../../services/authorization-service');
const id = require('../../validation/ids');

module.exports = {
    method: 'GET',
    path: '/dashboard',
    options: {
        auth: 'session',
        validate: {
            query: Joi.object({
                streamerId: id,
                notice: Joi.string().valid(...DashboardActionResponse.noticeCodes),
                error: Joi.string().valid(...DashboardActionResponse.errorCodes)
            })
        }
    },
    handler: async (request, h) => {
        const user = request.auth.credentials;

        try {
            const dashboard = await request.services().dashboardService.overview(user.id, request.query.streamerId);
            const management = dashboard.currentStreamer ?
                await request.services().ownerManagementDashboardService.details(user.id, dashboard.currentStreamer.id) : {};
            return h.view('dashboard', {
                title: 'Dashboard',
                pageStylesheet: '/assets/styles/owner-management.css',
                user,
                ...dashboard,
                ...management,
                feedback: DashboardActionResponse.fromQuery(request.query)
            });
        }
        catch (error) {
            if (error instanceof ResourceNotFoundError) {
                return h.response('Streamer not found').code(404);
            }

            throw error;
        }
    }
};
