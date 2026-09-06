'use strict';

const Joi = require('@hapi/joi');
const DashboardActionResponse = require('../../http/dashboard-action-response');
const { ResourceNotFoundError } = require('../../services/authorization-service');
const id = require('../../validation/ids');

const nullable = (value) => value === '' || value === undefined ? null : value;
const common = {
    name: Joi.string().trim().min(1).max(120).required(),
    description: Joi.string().allow('').max(2000).default(''),
    pointCost: Joi.number().integer().positive().required(),
    enabled: Joi.boolean().required(),
    perUserCooldownSeconds: Joi.number().integer().min(0).allow(null).required(),
    globalCooldownSeconds: Joi.number().integer().min(0).allow(null).required(),
    perStreamLimit: Joi.number().integer().positive().allow(null).required()
};
const baseSchema = Joi.object({ streamerId: id.required(), action: Joi.string().valid('create', 'update').required() }).unknown(true);
const createSchema = Joi.object({
    streamerId: id.required(),
    action: Joi.valid('create').required(),
    ...common,
    eligibilityMembership: Joi.string().valid('any', 'member', 'nonMember').required(),
    fulfillmentType: Joi.string().valid('manual', 'deterministicBot').required(),
    executorAction: Joi.when('fulfillmentType', {
        is: 'deterministicBot',
        then: Joi.string().valid('sendChat', 'runCommand', 'applyRole').required(),
        otherwise: Joi.any().strip()
    })
});
const updateSchema = Joi.object({ streamerId: id.required(), action: Joi.valid('update').required(), rewardId: id.required(), ...common });
const normalize = (payload = {}) => ({
    ...payload,
    perUserCooldownSeconds: nullable(payload.perUserCooldownSeconds),
    globalCooldownSeconds: nullable(payload.globalCooldownSeconds),
    perStreamLimit: nullable(payload.perStreamLimit)
});
const commonRewardFields = (values) => ({
    name: values.name,
    description: values.description,
    pointCost: values.pointCost,
    enabled: values.enabled,
    perUserCooldownSeconds: values.perUserCooldownSeconds,
    globalCooldownSeconds: values.globalCooldownSeconds,
    perStreamLimit: values.perStreamLimit
});

module.exports = {
    method: 'POST',
    path: '/dashboard/rewards',
    options: { auth: 'session' },
    handler: async (request, h) => {
        let streamerId = request.payload?.streamerId;
        try {
            const normalized = normalize(request.payload);
            const meta = await baseSchema.validateAsync(normalized);
            streamerId = meta.streamerId;
            const service = request.services().rewardService;

            if (meta.action === 'create') {
                const values = await createSchema.validateAsync(normalized);
                await service.createReward(request.auth.credentials.id, streamerId, {
                    ...commonRewardFields(values),
                    eligibilityPolicy: { membership: values.eligibilityMembership, providers: [] },
                    fulfillmentType: values.fulfillmentType,
                    executorConfiguration: values.fulfillmentType === 'manual' ? {} : { action: values.executorAction, parameters: {} }
                });
                return DashboardActionResponse.redirect(h, { streamerId, section: 'rewards', notice: 'reward-created' });
            }

            const values = await updateSchema.validateAsync(normalized);
            if (!await service.updateReward(request.auth.credentials.id, streamerId, values.rewardId, commonRewardFields(values))) throw new ResourceNotFoundError('Reward');
            return DashboardActionResponse.redirect(h, { streamerId, section: 'rewards', notice: 'reward-updated' });
        }
        catch (error) {
            return DashboardActionResponse.fromError(error, h, { streamerId, section: 'rewards' });
        }
    }
};
