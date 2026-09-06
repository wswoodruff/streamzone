'use strict';

const Joi = require('@hapi/joi');
const DashboardActionResponse = require('../../http/dashboard-action-response');
const id = require('../../validation/ids');

const actions = ['create', 'update', 'validate', 'acknowledge', 'publish', 'rollback'];
const baseSchema = Joi.object({ streamerId: id.required(), action: Joi.string().valid(...actions).required() }).unknown(true);
const createSchema = Joi.object({ streamerId: id.required(), action: Joi.valid('create').required(), instruction: Joi.string().max(4000).required() });
const updateSchema = Joi.object({ streamerId: id.required(), action: Joi.valid('update').required(), versionId: id.required(), instruction: Joi.string().max(4000).required() });
const versionSchema = (action) => Joi.object({ streamerId: id.required(), action: Joi.valid(action).required(), versionId: id.required() });

module.exports = {
    method: 'POST',
    path: '/dashboard/ai/instructions',
    options: { auth: 'session' },
    handler: async (request, h) => {
        let streamerId = request.payload?.streamerId;
        try {
            const meta = await baseSchema.validateAsync(request.payload || {});
            streamerId = meta.streamerId;
            const service = request.services().instructionService;
            let notice;

            if (meta.action === 'create') {
                const values = await createSchema.validateAsync(request.payload);
                await service.createDraft(request.auth.credentials.id, streamerId, values.instruction);
                notice = 'instruction-created';
            }
            else if (meta.action === 'update') {
                const values = await updateSchema.validateAsync(request.payload);
                await service.updateDraft(request.auth.credentials.id, streamerId, values.versionId, values.instruction);
                notice = 'instruction-updated';
            }
            else {
                const values = await versionSchema(meta.action).validateAsync(request.payload);
                if (meta.action === 'validate') {
                    await service.requestValidation(request.auth.credentials.id, streamerId, values.versionId);
                    notice = 'instruction-validated';
                }
                else if (meta.action === 'acknowledge') {
                    await service.acknowledgeWarnings(request.auth.credentials.id, streamerId, values.versionId);
                    notice = 'instruction-warnings-acknowledged';
                }
                else if (meta.action === 'publish') {
                    await service.publish(request.auth.credentials.id, streamerId, values.versionId);
                    notice = 'instruction-published';
                }
                else {
                    await service.rollback(request.auth.credentials.id, streamerId, values.versionId);
                    notice = 'instruction-rolled-back';
                }
            }

            return DashboardActionResponse.redirect(h, { streamerId, section: 'ai', notice });
        }
        catch (error) {
            return DashboardActionResponse.fromError(error, h, { streamerId, section: 'ai' });
        }
    }
};
