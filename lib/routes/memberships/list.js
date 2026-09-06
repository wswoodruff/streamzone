'use strict';
const ManagementResponse = require('../../http/management-response');
const Joi = require('@hapi/joi');
const id = require('../../validation/ids');
module.exports = { method: 'GET', path: '/streamers/{streamerId}/memberships', options: { auth: 'session', validate: { params: Joi.object({ streamerId: id.required() }) } }, handler: async (request, h) => { try { return await request.services().invitationService.listMemberships(request.auth.credentials.id, request.params.streamerId); } catch (error) { return ManagementResponse.fromError(error, h); } } };
