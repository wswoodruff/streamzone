'use strict';

module.exports = {
    method: 'GET',
    path: '/streamers',
    handler: (request) => request.services().streamingService.listStreamers()
};
