'use strict';
module.exports = {
    method: 'DELETE', path: '/streamers/{streamerId}/provider-connections/{connectionId}', options: { auth: 'session' },
    handler: async (request) => request.services().providerOAuthService.revoke(request.auth.credentials.id, Number(request.params.streamerId), Number(request.params.connectionId))
};
