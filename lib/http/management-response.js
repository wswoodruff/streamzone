'use strict';

exports.fromError = (error, h) => {
    if (error?.code === 'NOT_FOUND') {
        return h.response({ message: error.message }).code(404);
    }
    if (error?.code === 'FORBIDDEN') {
        return h.response({ message: error.message }).code(403);
    }
    throw error;
};
