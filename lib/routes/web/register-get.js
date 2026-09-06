'use strict';

module.exports = {
    method: 'GET',
    path: '/register',
    options: { auth: false },
    handler: (request, h) => h.view('register', { title: 'Create account' })
};
