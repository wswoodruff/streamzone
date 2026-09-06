'use strict';
const Joi = require('@hapi/joi'); const id = require('../../validation/ids'); const schemas = require('../../validation/rewards');
module.exports = { method: 'GET', path: '/participants/streamers/{streamerId}/rewards', options: { auth: false, validate: { params: Joi.object({ streamerId: id.required() }), query: schemas.participant } }, handler: (request) => request.services().rewardService.listAvailableRewards(request.params.streamerId, request.query.chatUserId, request.query.provider) };
