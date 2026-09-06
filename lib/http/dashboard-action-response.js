'use strict';

const notices = Object.freeze({
    'member-updated': 'Team member role updated.',
    'member-removed': 'Team member removed.',
    'invitation-created': 'Invitation created and added to the pending list.',
    'invitation-revoked': 'Invitation revoked.',
    'reward-created': 'Reward created.',
    'reward-updated': 'Reward configuration updated.',
    'ai-updated': 'Standalone AI configuration updated.',
    'instruction-created': 'AI instruction draft created.',
    'instruction-updated': 'AI instruction draft updated.',
    'instruction-validated': 'AI instruction validation completed.',
    'instruction-warnings-acknowledged': 'AI instruction warnings acknowledged.',
    'instruction-published': 'AI instruction version published.',
    'instruction-rolled-back': 'AI instruction rollback published as a new version.'
});

const errors = Object.freeze({
    'invalid-input': 'Review the submitted values and try again.',
    forbidden: 'Your creator role does not permit that change.',
    'not-found': 'The requested management resource no longer exists.',
    conflict: 'That change conflicts with current management state.',
    'final-owner': 'A streamer must retain at least one owner. Add or promote another owner before removing or demoting the final owner.',
    'invitation-used': 'That invitation has already been accepted.',
    'invitation-expired': 'That invitation has expired.',
    'invitation-revoked': 'That invitation has already been revoked.',
    'unsupported-reward-type': 'Only manual and deterministic bot rewards are supported.',
    'executor-configuration-required': 'Deterministic bot rewards require a supported executor action.',
    'instruction-version-not-found': 'That AI instruction version no longer exists.',
    'instruction-immutable': 'Published AI instruction versions are immutable.',
    'instruction-state': 'That AI instruction action is not valid for the current version state.',
    'instruction-stale': 'The AI instruction must have a current approval before publishing.',
    'instruction-rejected': 'Rejected AI instructions cannot be published.',
    'instruction-warnings': 'Acknowledge the current validation warnings before publishing.',
    'instruction-rollback': 'Only a previously published AI instruction can be rolled back.'
});

const domainErrorCodes = Object.freeze({
    FORBIDDEN: 'forbidden',
    NOT_FOUND: 'not-found',
    CONFLICT: 'conflict',
    FINAL_OWNER: 'final-owner',
    INVALID_INVITATION: 'invalid-input',
    INVITATION_USED: 'invitation-used',
    INVITATION_EXPIRED: 'invitation-expired',
    INVITATION_REVOKED: 'invitation-revoked',
    UNSUPPORTED_FULFILLMENT_TYPE: 'unsupported-reward-type',
    EXECUTOR_CONFIGURATION_REQUIRED: 'executor-configuration-required',
    VERSION_NOT_FOUND: 'instruction-version-not-found',
    IMMUTABLE_VERSION: 'instruction-immutable',
    INVALID_STATE: 'instruction-state',
    STALE_APPROVAL: 'instruction-stale',
    REJECTED_VERSION: 'instruction-rejected',
    WARNINGS_NOT_ACKNOWLEDGED: 'instruction-warnings',
    INVALID_ROLLBACK: 'instruction-rollback',
    ROLLBACK_REJECTED: 'instruction-rejected'
});

const dashboardUrl = (streamerId, section, query) => {
    const params = new URLSearchParams({ streamerId: String(streamerId), ...query });
    return `/dashboard?${params.toString()}#${section}`;
};

exports.noticeCodes = Object.keys(notices);
exports.errorCodes = Object.keys(errors);

exports.fromQuery = ({ notice, error }) => {
    if (error && errors[error]) return { type: 'error', isError: true, title: 'Could not save', message: errors[error] };
    if (notice && notices[notice]) return { type: 'success', isError: false, title: 'Saved', message: notices[notice] };
    return null;
};

exports.redirect = (h, { streamerId, section, notice, error }) => h
    .redirect(dashboardUrl(streamerId, section, notice ? { notice } : { error }))
    .code(303);

exports.fromError = (error, h, context) => {
    const code = error?.isJoi ? 'invalid-input' : domainErrorCodes[error?.code];
    if (!code) throw error;
    return exports.redirect(h, { ...context, error: code });
};
