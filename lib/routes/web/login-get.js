'use strict';

const { next } = require('../../validation/auth');

module.exports = {
    method: 'GET',
    path: '/login',
    options: { auth: false, validate: { query: next } },
    handler: (request, h) => h.view('login', { title: 'Sign in', next: request.query.next })
};
