'use strict';
const Joi = require('@hapi/joi');
exports.create = Joi.object({ instruction: Joi.string().max(4000).required(), basedOnVersionId: Joi.number().integer().positive().allow(null) });
exports.update = Joi.object({ instruction: Joi.string().max(4000).required() });
