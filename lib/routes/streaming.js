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
const commandFields = {
    name: Joi.string().lowercase().pattern(/^[a-z0-9][a-z0-9_-]*$/).max(50),
    responseTemplate: Joi.string().trim().min(1).max(1000),
    enabled: Joi.boolean(),
    cooldownSeconds: Joi.number().integer().min(0).max(86400)
};
const commandPayload = Joi.object(commandFields).fork(['name', 'responseTemplate'], (schema) => schema.required());
const commandPatchPayload = Joi.object(commandFields).min(1);

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
        path: '/streamers/{streamerId}/commands',
        options: {
            auth: 'session',
            validate: {
                params: Joi.object({ streamerId: id.required() }),
                query: Joi.object({ includeDisabled: Joi.boolean().default(false) })
            }
        },
        handler: async (request, h) => {
            const commands = await request.services().streamingService.listCommands(request.params.streamerId, request.query);
            return commands || h.response({ message: 'Streamer not found' }).code(404);
        }
    },
    {
        method: 'POST',
        path: '/streamers/{streamerId}/commands',
        options: {
            auth: 'session',
            validate: {
                params: Joi.object({ streamerId: id.required() }),
                payload: commandPayload
            }
        },
        handler: async (request, h) => {
            const command = await request.services().streamingService.createCommand(request.params.streamerId, request.payload);
            return command ? h.response(command).code(201) : h.response({ message: 'Streamer not found' }).code(404);
        }
    },
    {
        method: 'PATCH',
        path: '/streamers/{streamerId}/commands/{commandId}',
        options: {
            auth: 'session',
            validate: {
                params: Joi.object({ streamerId: id.required(), commandId: id.required() }),
                payload: commandPatchPayload
            }
        },
        handler: async (request, h) => {
            const command = await request.services().streamingService.updateCommand(
                request.params.streamerId, request.params.commandId, request.payload
            );
            return command || h.response({ message: 'Command not found' }).code(404);
        }
    },
    {
        method: 'DELETE',
        path: '/streamers/{streamerId}/commands/{commandId}',
        options: {
            auth: 'session',
            validate: { params: Joi.object({ streamerId: id.required(), commandId: id.required() }) }
        },
        handler: async (request, h) => {
            const deleted = await request.services().streamingService.deleteCommand(request.params.streamerId, request.params.commandId);
            return deleted ? h.response().code(204) : h.response({ message: 'Command not found' }).code(404);
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
