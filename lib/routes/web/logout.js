'use strict';

module.exports = {
    method: 'POST',
    path: '/logout',
    options: { auth: 'session' },
    handler: async (request, h) => {
        await request.services().authService.logout(request.state['streamzone-session']?.token);
        request.cookieAuth.clear();
        return h.redirect('/');
    }
};
