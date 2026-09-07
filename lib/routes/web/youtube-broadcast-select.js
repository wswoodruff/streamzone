'use strict';
const Joi = require('@hapi/joi');
module.exports = {
    method: 'POST', path: '/streamers/{streamerId}/provider-connections/{connectionId}/youtube/broadcasts/select', options: { auth: 'session', validate: { payload: Joi.object({ broadcastId: Joi.string().max(255).required(), streamSessionId: Joi.number().integer().positive().allow('', null), newSessionTitle: Joi.string().trim().max(255).allow('', null) }) } },
    handler: async (request, h) => { try { await request.services().youtubeProviderService.select(request.auth.credentials.id, Number(request.params.streamerId), Number(request.params.connectionId), request.payload.broadcastId, request.payload.streamSessionId || null, request.payload.newSessionTitle || null); return h.redirect(`/dashboard/stream-management?streamerId=${request.params.streamerId}&notice=${encodeURIComponent('YouTube broadcast connected.') }#broadcasts`); } catch (error) { return h.redirect(`/dashboard/stream-management?streamerId=${request.params.streamerId}&error=${encodeURIComponent(error.message)}#broadcasts`); } }
};
