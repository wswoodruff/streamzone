'use strict';
const Joi = require('@hapi/joi'); const id = require('../../validation/ids'); const Response = require('../../http/management-response');
module.exports = { method: 'GET', path: '/streamers/{streamerId}/instructions', options: { auth: 'session', validate: { params: Joi.object({ streamerId: id.required() }) } }, handler: async (request, h) => { try { return await request.services().instructionService.list(request.auth.credentials.id, request.params.streamerId); } catch (error) { return Response.fromError(error, h); } } };
