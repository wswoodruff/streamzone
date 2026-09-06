'use strict';
const ManagementResponse = require('../../http/management-response');
const Joi = require('@hapi/joi');
const id = require('../../validation/ids');
module.exports = { method: 'DELETE', path: '/streamers/{streamerId}/memberships/{userId}', options: { auth: 'session', validate: { params: Joi.object({ streamerId: id.required(), userId: id.required() }) } }, handler: async (request, h) => { try { const result = await request.services().invitationService.removeMembership(request.auth.credentials.id, request.params.streamerId, request.params.userId); return result ? h.response().code(204) : h.response({ message: 'Membership not found' }).code(404); } catch (error) { return ManagementResponse.fromError(error, h); } } };
