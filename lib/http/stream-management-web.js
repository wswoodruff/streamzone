'use strict';

const knownErrorCodes = new Set([
    'FORBIDDEN',
    'NOT_FOUND',
    'INVALID_SESSION_LIFECYCLE',
    'INVALID_STREAM_MANAGEMENT_FORM'
]);

const pageUrl = (streamerId, kind, message, anchor) => {
    const params = new URLSearchParams({ streamerId: String(streamerId) });
    if (kind && message) params.set(kind, message);
    return `/dashboard/stream-management?${params.toString()}${anchor ? `#${anchor}` : ''}`;
};

exports.redirect = (h, streamerId, kind, message, anchor) => h.redirect(pageUrl(streamerId, kind, message, anchor)).code(303);

exports.failAction = (anchor) => (request, h) => {
    const streamerId = Number(request.payload?.streamerId);
    if (!Number.isInteger(streamerId) || streamerId <= 0) {
        return h.response('Invalid stream management form').code(400).takeover();
    }

    return exports.redirect(h, streamerId, 'error', 'Check the form values and try again.', anchor).takeover();
};

exports.fromError = (error, h, streamerId, anchor) => {
    if (knownErrorCodes.has(error?.code)) {
        return exports.redirect(h, streamerId, 'error', error.message, anchor);
    }
    if (typeof error?.code === 'string' && error.code.startsWith('SQLITE_CONSTRAINT')) {
        return exports.redirect(h, streamerId, 'error', 'That value conflicts with an existing record.', anchor);
    }

    throw error;
};
