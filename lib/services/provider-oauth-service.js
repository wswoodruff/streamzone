'use strict';
const Crypto = require('node:crypto');
const Schmervice = require('@hapipal/schmervice');
const { loadOAuthEnvironment } = require('../config/environment');

const LOGIN_SCOPES = ['openid', 'email', 'profile'];
const YOUTUBE_SCOPES = ['openid', 'https://www.googleapis.com/auth/youtube.readonly'];
class OAuthError extends Error { constructor(message, code = 'OAUTH_ERROR') { super(message); this.name = 'OAuthError'; this.code = code; } }
const digest = (value) => Crypto.createHash('sha256').update(value).digest('hex');
const base64url = (buffer) => buffer.toString('base64url');

module.exports = class ProviderOAuthService extends Schmervice.Service {
    configuration() { return this.options?.configuration || loadOAuthEnvironment(); }
    http() { return this.options?.fetch || globalThis.fetch; }
    async begin({ purpose, userId = null, streamerId = null }) {
        const config = this.configuration().google;
        const state = base64url(Crypto.randomBytes(32));
        const verifier = base64url(Crypto.randomBytes(64));
        const nonce = base64url(Crypto.randomBytes(24));
        const callbackUrl = purpose === 'dashboard_login' ? config.loginCallbackUrl : config.youtubeCallbackUrl;
        const scopes = purpose === 'dashboard_login' ? LOGIN_SCOPES : YOUTUBE_SCOPES;
        const { OAuthAuthorizationState } = this.server.models();
        await OAuthAuthorizationState.query().insert({ stateHash: digest(state), purpose, provider: 'google', userId, streamerId, pkceVerifier: verifier, nonce, expiresAt: new Date(Date.now() + 10 * 60_000).toISOString() });
        const query = new URLSearchParams({ client_id: config.clientId, redirect_uri: callbackUrl, response_type: 'code', scope: scopes.join(' '), state, nonce, code_challenge: base64url(Crypto.createHash('sha256').update(verifier).digest()), code_challenge_method: 'S256', access_type: 'offline', prompt: purpose === 'provider_connection' ? 'consent' : 'select_account' });
        return `${config.authorizationUrl}?${query}`;
    }
    async consumeState(state, expectedPurpose) {
        if (!state) throw new OAuthError('OAuth state is missing.', 'INVALID_STATE');
        const { OAuthAuthorizationState } = this.server.models();
        return OAuthAuthorizationState.transaction(async (trx) => {
            const record = await OAuthAuthorizationState.query(trx).findById(digest(state)).forUpdate();
            if (!record || record.purpose !== expectedPurpose || record.consumedAt) throw new OAuthError('OAuth state is invalid or was already used.', 'INVALID_STATE');
            if (new Date(record.expiresAt) <= new Date()) throw new OAuthError('OAuth state has expired.', 'EXPIRED_STATE');
            await OAuthAuthorizationState.query(trx).patchAndFetchById(record.stateHash, { consumedAt: new Date().toISOString() });
            return record;
        });
    }
    async exchange(code, stateRecord) {
        const config = this.configuration().google;
        const redirectUri = stateRecord.purpose === 'dashboard_login' ? config.loginCallbackUrl : config.youtubeCallbackUrl;
        const response = await this.http()(config.tokenUrl, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ code, client_id: config.clientId, client_secret: config.clientSecret, redirect_uri: redirectUri, grant_type: 'authorization_code', code_verifier: stateRecord.pkceVerifier }) });
        if (!response.ok) throw new OAuthError('OAuth code exchange failed.', 'TOKEN_EXCHANGE_FAILED');
        const tokens = await response.json();
        const claims = await this.validateIdentityToken(tokens.id_token, stateRecord.nonce);
        return { tokens, claims };
    }
    async validateIdentityToken(idToken, nonce) {
        if (!idToken) throw new OAuthError('Provider did not return an identity token.', 'INVALID_ID_TOKEN');
        const config = this.configuration().google;
        const response = await this.http()(`${config.tokenInfoUrl}?id_token=${encodeURIComponent(idToken)}`);
        if (!response.ok) throw new OAuthError('Identity token validation failed.', 'INVALID_ID_TOKEN');
        const claims = await response.json();
        if (!['https://accounts.google.com', 'accounts.google.com'].includes(claims.iss) || claims.aud !== config.clientId || claims.nonce !== nonce || Number(claims.exp) * 1000 <= Date.now()) throw new OAuthError('Identity token claims are invalid.', 'INVALID_ID_TOKEN');
        return claims;
    }
    assertScopes(tokens, required) {
        const granted = new Set(String(tokens.scope || '').split(/\s+/).filter(Boolean));
        if (required.some((scope) => !granted.has(scope))) throw new OAuthError('Required provider scopes were not granted.', 'MISSING_SCOPES');
        return [...granted];
    }
    async completeLogin(code, state) {
        const record = await this.consumeState(state, 'dashboard_login');
        const { tokens, claims } = await this.exchange(code, record);
        this.assertScopes(tokens, LOGIN_SCOPES);
        const { ExternalLoginIdentity, User } = this.server.models();
        const existing = await ExternalLoginIdentity.query().findOne({ provider: 'google', providerSubject: claims.sub }).withGraphFetched('user');
        if (existing) return existing.user;
        const emailUser = claims.email ? await User.query().findOne({ email: claims.email.toLowerCase() }) : null;
        if (emailUser) throw new OAuthError('Sign in first to link this Google identity.', 'ACCOUNT_LINK_CONFLICT');
        throw new OAuthError('No Streamzone account is linked to this Google identity.', 'ACCOUNT_NOT_LINKED');
    }
    async linkLoginIdentity(userId, providerSubject) {
        const { ExternalLoginIdentity } = this.server.models();
        const subjectIdentity = await ExternalLoginIdentity.query().findOne({ provider: 'google', providerSubject });
        if (subjectIdentity && subjectIdentity.userId !== userId) throw new OAuthError('Google identity is linked to another account.', 'ACCOUNT_LINK_CONFLICT');
        const userIdentity = await ExternalLoginIdentity.query().findOne({ provider: 'google', userId });
        if (userIdentity && userIdentity.providerSubject !== providerSubject) throw new OAuthError('Account already has a different Google identity.', 'ACCOUNT_LINK_CONFLICT');
        return subjectIdentity || userIdentity || ExternalLoginIdentity.query().insert({ provider: 'google', providerSubject, userId });
    }
    async completeConnection(code, state, actorUserId) {
        const record = await this.consumeState(state, 'provider_connection');
        if (record.userId !== actorUserId) throw new OAuthError('OAuth grant belongs to another user.', 'INVALID_STATE');
        await this.server.services().authorizationService.requireCapability(actorUserId, record.streamerId, 'manageProviderConnections');
        const { tokens, claims } = await this.exchange(code, record);
        const scopes = this.assertScopes(tokens, YOUTUBE_SCOPES);
        return this.saveConnection(record.streamerId, actorUserId, claims.sub, claims.channel_id || claims.sub, scopes, tokens);
    }
    async saveConnection(streamerId, userId, accountId, channelId, scopes, tokens) {
        const { ProviderConnection, ProviderCredential } = this.server.models();
        const encryption = this.server.services().credentialEncryptionService;
        return ProviderConnection.transaction(async (trx) => {
            const expiresAt = tokens.expires_in ? new Date(Date.now() + Number(tokens.expires_in) * 1000).toISOString() : null;
            const connection = await ProviderConnection.query(trx).insert({ streamerId, authorizedByUserId: userId, provider: 'youtube', providerAccountId: accountId, providerChannelId: channelId, grantedScopes: scopes, status: 'active', tokenExpiresAt: expiresAt });
            await ProviderCredential.query(trx).insert({ providerConnectionId: connection.id, accessTokenCiphertext: encryption.encrypt(tokens.access_token, connection.id), refreshTokenCiphertext: encryption.encrypt(tokens.refresh_token, connection.id), keyVersion: encryption.configuration().keyVersion });
            return connection;
        });
    }
    async refresh(connectionId) {
        const { ProviderConnection, ProviderCredential } = this.server.models();
        const connection = await ProviderConnection.query().findById(connectionId);
        const credential = await ProviderCredential.query().findById(connectionId);
        if (!connection || connection.status !== 'active' || !credential?.refreshTokenCiphertext) throw new OAuthError('Connection must be reconnected.', 'RECONNECT_REQUIRED');
        const encryption = this.server.services().credentialEncryptionService;
        const config = this.configuration().google;
        const response = await this.http()(config.tokenUrl, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, grant_type: 'refresh_token', refresh_token: encryption.decrypt(credential.refreshTokenCiphertext, connection.id) }) });
        if (!response.ok) { await ProviderConnection.query().patchAndFetchById(connection.id, { status: 'reconnect_required', reconnectReason: 'refresh_failed', updatedAt: new Date().toISOString() }); throw new OAuthError('Token refresh failed.', 'RECONNECT_REQUIRED'); }
        const tokens = await response.json(); this.assertScopes(tokens.scope ? tokens : { scope: connection.grantedScopes.join(' ') }, connection.grantedScopes);
        await ProviderCredential.query().patchAndFetchById(connection.id, { accessTokenCiphertext: encryption.encrypt(tokens.access_token, connection.id), refreshTokenCiphertext: tokens.refresh_token ? encryption.encrypt(tokens.refresh_token, connection.id) : credential.refreshTokenCiphertext, updatedAt: new Date().toISOString() });
        await ProviderConnection.query().patchAndFetchById(connection.id, { tokenExpiresAt: new Date(Date.now() + Number(tokens.expires_in) * 1000).toISOString(), updatedAt: new Date().toISOString() });
        return tokens.access_token;
    }
    async revoke(actorUserId, streamerId, connectionId) {
        await this.server.services().authorizationService.requireCapability(actorUserId, streamerId, 'manageProviderConnections');
        const { ProviderConnection, ProviderCredential } = this.server.models();
        const connection = await ProviderConnection.query().findOne({ id: connectionId, streamerId });
        if (!connection) throw new OAuthError('Provider connection not found.', 'NOT_FOUND');
        const credential = await ProviderCredential.query().findById(connectionId);
        let revocationReason = 'user_requested';
        if (credential) {
            const token = this.server.services().credentialEncryptionService.decrypt(credential.refreshTokenCiphertext || credential.accessTokenCiphertext, connectionId);
            try { const response = await this.http()(this.configuration().google.revokeUrl, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token }) }); if (!response.ok) revocationReason = 'provider_revocation_failed'; }
            catch { revocationReason = 'provider_revocation_failed'; }
        }
        await ProviderCredential.query().deleteById(connectionId);
        return ProviderConnection.query().patchAndFetchById(connectionId, { status: 'revoked', revokedAt: new Date().toISOString(), revokedByUserId: actorUserId, revocationReason, reconnectReason: null, updatedAt: new Date().toISOString() });
    }
};
module.exports.OAuthError = OAuthError;
module.exports.LOGIN_SCOPES = LOGIN_SCOPES;
module.exports.YOUTUBE_SCOPES = YOUTUBE_SCOPES;
