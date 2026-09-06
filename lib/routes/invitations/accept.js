'use strict';
const ManagementResponse = require('../../http/management-response');
const { acceptPayload } = require('../../validation/memberships');
module.exports = { method: 'POST', path: '/invitations/accept', options: { auth: 'session', validate: { payload: acceptPayload } }, handler: async (request, h) => { try { return await request.services().invitationService.accept(request.auth.credentials.id, request.payload.token); } catch (error) { return ManagementResponse.fromError(error, h); } } };
