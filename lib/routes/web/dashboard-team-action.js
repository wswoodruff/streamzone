'use strict';

const Joi = require('@hapi/joi');
const DashboardActionResponse = require('../../http/dashboard-action-response');
const { ResourceNotFoundError } = require('../../services/authorization-service');
const { roles } = require('../../models/streamer-membership');
const id = require('../../validation/ids');

const actions = ['update-member', 'remove-member', 'create-invite', 'revoke-invite'];
const baseSchema = Joi.object({ streamerId: id.required(), action: Joi.string().valid(...actions).required() }).unknown(true);
const schemas = {
    'update-member': Joi.object({ streamerId: id.required(), action: Joi.valid('update-member').required(), userId: id.required(), role: Joi.string().valid(...roles).required() }),
    'remove-member': Joi.object({ streamerId: id.required(), action: Joi.valid('remove-member').required(), userId: id.required() }),
    'create-invite': Joi.object({ streamerId: id.required(), action: Joi.valid('create-invite').required(), email: Joi.string().email().max(254).required(), role: Joi.string().valid(...roles).required() }),
    'revoke-invite': Joi.object({ streamerId: id.required(), action: Joi.valid('revoke-invite').required(), invitationId: id.required() })
};

module.exports = {
    method: 'POST',
    path: '/dashboard/team',
    options: { auth: 'session' },
    handler: async (request, h) => {
        let streamerId = request.payload?.streamerId;
        try {
            const meta = await baseSchema.validateAsync(request.payload || {});
            streamerId = meta.streamerId;
            const values = await schemas[meta.action].validateAsync(request.payload);
            const service = request.services().invitationService;
            let notice;

            if (meta.action === 'update-member') {
                if (!await service.updateMembership(request.auth.credentials.id, streamerId, values.userId, values.role)) throw new ResourceNotFoundError('Membership');
                notice = 'member-updated';
            }
            else if (meta.action === 'remove-member') {
                if (!await service.removeMembership(request.auth.credentials.id, streamerId, values.userId)) throw new ResourceNotFoundError('Membership');
                notice = 'member-removed';
            }
            else if (meta.action === 'create-invite') {
                await service.create(request.auth.credentials.id, streamerId, { email: values.email, role: values.role });
                notice = 'invitation-created';
            }
            else {
                await service.revoke(request.auth.credentials.id, streamerId, values.invitationId);
                notice = 'invitation-revoked';
            }

            return DashboardActionResponse.redirect(h, { streamerId, section: 'team', notice });
        }
        catch (error) {
            return DashboardActionResponse.fromError(error, h, { streamerId, section: 'team' });
        }
    }
};
