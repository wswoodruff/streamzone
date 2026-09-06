'use strict';
const ManagementResponse = require('../../http/management-response');
const Joi = require('@hapi/joi');
const id = require('../../validation/ids');
const { invitationPayload } = require('../../validation/memberships');
module.exports = { method: 'POST', path: '/streamers/{streamerId}/invitations', options: { auth: 'session', validate: { params: Joi.object({ streamerId: id.required() }), payload: invitationPayload } }, handler: async (request, h) => { try { const { invitation, token } = await request.services().invitationService.create(request.auth.credentials.id, request.params.streamerId, request.payload); return h.response({ invitation, token }).code(201); } catch (error) { return ManagementResponse.fromError(error, h); } } };
