'use strict';
const Joi = require('@hapi/joi');
module.exports = {
    method: 'GET', path: '/streamers/{streamerId}/provider-connections/{connectionId}/youtube/broadcasts',
    options: { auth: 'session', validate: { params: Joi.object({ streamerId: Joi.number().integer().positive().required(), connectionId: Joi.number().integer().positive().required() }) } },
    handler: async (request, h) => { try { return { broadcasts: await request.services().youtubeProviderService.discover(request.auth.credentials.id, Number(request.params.streamerId), Number(request.params.connectionId)) }; } catch (error) { return h.response({ error: error.code || 'PROVIDER_ERROR', message: error.message }).code(error.statusCode || 400); } }
};
