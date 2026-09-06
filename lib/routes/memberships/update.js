'use strict';
const ManagementResponse = require('../../http/management-response');
const Joi = require('@hapi/joi');
const id = require('../../validation/ids');
const { rolePayload } = require('../../validation/memberships');
module.exports = { method: 'PATCH', path: '/streamers/{streamerId}/memberships/{userId}', options: { auth: 'session', validate: { params: Joi.object({ streamerId: id.required(), userId: id.required() }), payload: rolePayload } }, handler: async (request, h) => { try { const result = await request.services().invitationService.updateMembership(request.auth.credentials.id, request.params.streamerId, request.params.userId, request.payload.role); return result || h.response({ message: 'Membership not found' }).code(404); } catch (error) { return ManagementResponse.fromError(error, h); } } };
