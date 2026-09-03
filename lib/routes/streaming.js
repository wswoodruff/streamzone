'use strict';

const Joi = require('@hapi/joi');

const id = Joi.number().integer().positive();
const sourcePayload = Joi.object({
    provider: Joi.string().valid('youtube', 'twitch').required(),
    channelId: Joi.string().trim().min(1).max(255).required(),
    enabled: Joi.boolean().default(true)
});
const streamerPayload = Joi.object({
    slug: Joi.string().lowercase().pattern(/^[a-z0-9-]+$/).max(80).required(),
    displayName: Joi.string().trim().min(1).max(120).required()
});
const streamPayload = Joi.object({
    sourceId: id.required(),
    externalId: Joi.string().trim().max(255).allow(null).default(null),
    title: Joi.string().trim().max(255).allow(null).default(null),
    status: Joi.string().valid('scheduled', 'live', 'offline').default('scheduled'),
    startedAt: Joi.date().iso().allow(null).default(null),
    endedAt: Joi.date().iso().allow(null).default(null)
});
const streamPatchPayload = Joi.object({
    sourceId: id,
    externalId: Joi.string().trim().max(255).allow(null),
    title: Joi.string().trim().max(255).allow(null),
    status: Joi.string().valid('scheduled', 'live', 'offline'),
    startedAt: Joi.date().iso().allow(null),
    endedAt: Joi.date().iso().allow(null)
}).min(1);

module.exports = [
    {
        method: 'GET',
        path: '/streamers',
        handler: (request) => request.services().streamingService.listStreamers()
    },
    {
        method: 'POST',
        path: '/streamers',
        options: {
            auth: 'session',
            validate: {
                payload: streamerPayload
            }
        },
        handler: async (request, h) => {
            const streamer = await request.services().streamingService.createStreamer(request.payload);

            return h.response(streamer).code(201);
        }
    },
    {
        method: 'POST',
        path: '/streamers/{streamerId}/sources',
        options: {
            auth: 'session',
            validate: {
                params: Joi.object({ streamerId: id.required() }),
                payload: sourcePayload
            }
        },
        handler: async (request, h) => {
            const source = await request.services().streamingService.addSource(
                request.params.streamerId,
                request.payload
            );

            return source ? h.response(source).code(201) : h.response({ message: 'Streamer not found' }).code(404);
        }
    },
    {
        method: 'GET',
        path: '/streams',
        options: {
            validate: {
                query: Joi.object({ status: Joi.string().valid('scheduled', 'live', 'offline') })
            }
        },
        handler: (request) => request.services().streamingService.listStreams(request.query.status)
    },
    {
        method: 'POST',
        path: '/streams',
        options: {
            auth: 'session',
            validate: {
                payload: streamPayload
            }
        },
        handler: async (request, h) => {
            const stream = await request.services().streamingService.createStream(request.payload);

            return stream ? h.response(stream).code(201) : h.response({ message: 'Source not found' }).code(404);
        }
    },
    {
        method: 'PATCH',
        path: '/streamers/{streamerId}',
        options: {
            auth: 'session',
            validate: {
                params: Joi.object({ streamerId: id.required() }),
                payload: streamerPayload.fork(['slug', 'displayName'], (schema) => schema.optional()).min(1)
            }
        },
        handler: async (request, h) => {
            const streamer = await request.services().streamingService.updateStreamer(request.params.streamerId, request.payload);
            return streamer || h.response({ message: 'Streamer not found' }).code(404);
        }
    },
    {
        method: 'DELETE',
        path: '/streamers/{streamerId}',
        options: { auth: 'session', validate: { params: Joi.object({ streamerId: id.required() }) } },
        handler: async (request, h) => {
            const deleted = await request.services().streamingService.deleteStreamer(request.params.streamerId);
            return deleted ? h.response().code(204) : h.response({ message: 'Streamer not found' }).code(404);
        }
    },
    {
        method: 'PATCH',
        path: '/streams/{streamId}',
        options: {
            auth: 'session',
            validate: {
                params: Joi.object({ streamId: id.required() }),
                payload: streamPatchPayload
            }
        },
        handler: async (request, h) => {
            const stream = await request.services().streamingService.updateStream(request.params.streamId, request.payload);
            return stream || h.response({ message: 'Stream not found' }).code(404);
        }
    },
    {
        method: 'DELETE',
        path: '/streams/{streamId}',
        options: { auth: 'session', validate: { params: Joi.object({ streamId: id.required() }) } },
        handler: async (request, h) => {
            const deleted = await request.services().streamingService.deleteStream(request.params.streamId);
            return deleted ? h.response().code(204) : h.response({ message: 'Stream not found' }).code(404);
        }
    }
];
