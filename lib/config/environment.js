'use strict';

const required = (environment, name) => {
    const value = environment[name];
    if (!value) throw new Error(`${name} is required.`);
    return value;
};

const absoluteUrl = (value, name) => {
    try { return new URL(value).toString(); }
    catch { throw new Error(`${name} must be an absolute URL.`); }
};

exports.loadOAuthEnvironment = (environment = process.env) => {
    const encryptionKey = Buffer.from(required(environment, 'TOKEN_ENCRYPTION_KEY'), 'base64');
    if (encryptionKey.length !== 32) throw new Error('TOKEN_ENCRYPTION_KEY must be a base64-encoded 32-byte key.');
    const cookiePassword = required(environment, 'COOKIE_PASSWORD');
    if (cookiePassword.length < 32) throw new Error('COOKIE_PASSWORD must contain at least 32 characters.');
    return Object.freeze({
        cookiePassword,
        encryptionKey,
        keyVersion: environment.TOKEN_ENCRYPTION_KEY_VERSION || 'v1',
        google: Object.freeze({
            clientId: required(environment, 'GOOGLE_OAUTH_CLIENT_ID'),
            clientSecret: required(environment, 'GOOGLE_OAUTH_CLIENT_SECRET'),
            loginCallbackUrl: absoluteUrl(required(environment, 'GOOGLE_LOGIN_CALLBACK_URL'), 'GOOGLE_LOGIN_CALLBACK_URL'),
            youtubeCallbackUrl: absoluteUrl(required(environment, 'YOUTUBE_CONNECTION_CALLBACK_URL'), 'YOUTUBE_CONNECTION_CALLBACK_URL'),
            authorizationUrl: environment.GOOGLE_AUTHORIZATION_URL || 'https://accounts.google.com/o/oauth2/v2/auth',
            tokenUrl: environment.GOOGLE_TOKEN_URL || 'https://oauth2.googleapis.com/token',
            tokenInfoUrl: environment.GOOGLE_TOKEN_INFO_URL || 'https://oauth2.googleapis.com/tokeninfo',
            revokeUrl: environment.GOOGLE_REVOKE_URL || 'https://oauth2.googleapis.com/revoke'
        })
    });
};

exports.loadCookieEnvironment = (environment = process.env) => {
    const password = required(environment, 'COOKIE_PASSWORD');
    if (password.length < 32) throw new Error('COOKIE_PASSWORD must contain at least 32 characters.');
    return { password };
};
