'use strict';

const Joi = require('@hapi/joi');
const DashboardActionResponse = require('../../http/dashboard-action-response');
const { ResourceNotFoundError } = require('../../services/authorization-service');
const CommandManagement = require('../../view-models/command-management');
const id = require('../../validation/ids');

const commandStatus = Joi.string().valid('created', 'updated', 'enabled', 'disabled', 'deleted');

module.exports = {
    method: 'GET',
    path: '/dashboard',
    options: {
        auth: 'session',
        validate: {
            query: Joi.object({
                streamerId: id,
                commandStatus,
                notice: Joi.string().valid(...DashboardActionResponse.noticeCodes),
                error: Joi.string().valid(...DashboardActionResponse.errorCodes)
            })
        }
    },
    handler: async (request, h) => {
        const user = request.auth.credentials;

        try {
            const dashboard = await request.services().dashboardService.overview(user.id, request.query.streamerId);
            const commandManagement = dashboard.currentStreamer ? await CommandManagement.build({
                services: request.services(),
                userId: user.id,
                streamerId: dashboard.currentStreamer.id,
                canManage: dashboard.permissions.manageCommands,
                commandStatus: request.query.commandStatus
            }) : null;
            const management = dashboard.currentStreamer ?
                await request.services().ownerManagementDashboardService.details(user.id, dashboard.currentStreamer.id) : {};
            return h.view('dashboard', {
                title: 'Dashboard',
                pageStylesheet: '/assets/styles/owner-management.css',
                user,
                ...dashboard,
                ...management,
                commandManagement,
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
