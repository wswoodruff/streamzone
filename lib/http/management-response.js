'use strict';

exports.fromError = (error, h) => {
    if (error?.code === 'NOT_FOUND') {
        return h.response({ message: error.message }).code(404);
    }
    if (error?.code === 'FORBIDDEN') {
        return h.response({ message: error.message }).code(403);
    }
    if (error?.code === 'CONFLICT' || error?.code === 'INVITATION_USED') {
        return h.response({ message: error.message }).code(409);
    }
    if (error?.code === 'INVITATION_EXPIRED' || error?.code === 'INVITATION_REVOKED') {
        return h.response({ message: error.message }).code(410);
    }
    if (error?.code === 'INVALID_INVITATION') {
        return h.response({ message: error.message }).code(400);
    }
    throw error;
};
