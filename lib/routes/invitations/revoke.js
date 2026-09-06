'use strict';
const ManagementResponse = require('../../http/management-response');
const Joi = require('@hapi/joi');
const id = require('../../validation/ids');
module.exports = { method: 'DELETE', path: '/streamers/{streamerId}/invitations/{invitationId}', options: { auth: 'session', validate: { params: Joi.object({ streamerId: id.required(), invitationId: id.required() }) } }, handler: async (request, h) => { try { await request.services().invitationService.revoke(request.auth.credentials.id, request.params.streamerId, request.params.invitationId); return h.response().code(204); } catch (error) { return ManagementResponse.fromError(error, h); } } };
