'use strict';
const Schmervice = require('@hapipal/schmervice');
const YouTubeAdapter = require('../providers/youtube/adapter');
const { ProviderAdapterError } = require('../providers/provider-adapter');

class YouTubeConnectionError extends Error { constructor(message, code, statusCode = 400) { super(message); this.code = code; this.statusCode = statusCode; } }
module.exports = class YouTubeProviderService extends Schmervice.Service {
    adapter() { return this.options?.adapter || new YouTubeAdapter({ fetch: this.options?.fetch || globalThis.fetch, apiBaseUrl: this.options?.apiBaseUrl }); }
    async connect({ streamerId, userId, accountId, scopes, tokens }) {
        const identity = await this.adapter().getChannelIdentity(tokens.access_token);
        const { Source, ProviderConnection, ProviderCredential } = this.server.models();
        const owned = await Source.query().findOne({ provider: 'youtube', channelId: identity.id });
        if (owned && owned.streamerId !== streamerId) throw new YouTubeConnectionError('This YouTube channel is already connected to another creator workspace.', 'CHANNEL_OWNERSHIP_CONFLICT', 409);
        const encryption = this.server.services().credentialEncryptionService;
        return ProviderConnection.transaction(async (trx) => {
            const now = new Date().toISOString();
            const source = owned ? await Source.query(trx).patchAndFetchById(owned.id, { displayName: identity.displayName, avatarUrl: identity.avatarUrl, verifiedAt: now, enabled: true }) : await Source.query(trx).insert({ streamerId, provider: 'youtube', channelId: identity.id, displayName: identity.displayName, avatarUrl: identity.avatarUrl, verifiedAt: now, enabled: true });
            let connection = await ProviderConnection.query(trx).findOne({ streamerId, provider: 'youtube', providerChannelId: identity.id });
            const data = { streamerId, sourceId: source.id, authorizedByUserId: userId, provider: 'youtube', providerAccountId: accountId, providerChannelId: identity.id, grantedScopes: scopes, status: 'active', tokenExpiresAt: tokens.expires_in ? new Date(Date.now() + Number(tokens.expires_in) * 1000).toISOString() : null, reconnectReason: null, revokedAt: null, revocationReason: null, updatedAt: now };
            connection = connection ? await ProviderConnection.query(trx).patchAndFetchById(connection.id, data) : await ProviderConnection.query(trx).insert(data);
            const old = await ProviderCredential.query(trx).findById(connection.id);
            const credential = { accessTokenCiphertext: encryption.encrypt(tokens.access_token, connection.id), refreshTokenCiphertext: tokens.refresh_token ? encryption.encrypt(tokens.refresh_token, connection.id) : old?.refreshTokenCiphertext || null, keyVersion: encryption.configuration().keyVersion, updatedAt: now };
            if (old) await ProviderCredential.query(trx).patchAndFetchById(connection.id, credential); else await ProviderCredential.query(trx).insert({ providerConnectionId: connection.id, ...credential });
            return connection;
        });
    }
    async accessToken(connection) {
        const { ProviderCredential, ProviderConnection } = this.server.models();
        if (connection.status !== 'active') throw new YouTubeConnectionError('Reconnect YouTube to continue.', 'RECONNECT_REQUIRED', 401);
        const credential = await ProviderCredential.query().findById(connection.id);
        if (!credential) throw new YouTubeConnectionError('Reconnect YouTube to continue.', 'RECONNECT_REQUIRED', 401);
        if (connection.tokenExpiresAt && new Date(connection.tokenExpiresAt).getTime() < Date.now() + 30_000) return this.server.services().providerOAuthService.refresh(connection.id);
        return this.server.services().credentialEncryptionService.decrypt(credential.accessTokenCiphertext, connection.id);
    }
    async connection(actorUserId, streamerId, connectionId) { await this.server.services().authorizationService.requireCapability(actorUserId, streamerId, 'manageProviderConnections'); const connection = await this.server.models().ProviderConnection.query().findOne({ id: connectionId, streamerId, provider: 'youtube' }); if (!connection) throw new YouTubeConnectionError('YouTube connection not found.', 'NOT_FOUND', 404); return connection; }
    async discover(actorUserId, streamerId, connectionId) { const connection = await this.connection(actorUserId, streamerId, connectionId); try { return await this.adapter().discoverBroadcasts(await this.accessToken(connection)); } catch (error) { await this.handleProviderError(connection, error); throw error; } }
    async select(actorUserId, streamerId, connectionId, broadcastId, streamSessionId, newSessionTitle) {
        const connection = await this.connection(actorUserId, streamerId, connectionId); const { StreamSession, Stream, ProviderBroadcastSync } = this.server.models();
        let broadcast; try { broadcast = await this.adapter().getBroadcast(await this.accessToken(connection), broadcastId); } catch (error) { await this.handleProviderError(connection, error); throw error; }
        return Stream.transaction(async (trx) => {
            let session = streamSessionId ? await StreamSession.query(trx).findOne({ id: streamSessionId, streamerId }) : null;
            if (!session && newSessionTitle) session = await StreamSession.query(trx).insert({ streamerId, title: newSessionTitle, status: broadcast.status === 'ended' ? 'ended' : broadcast.status, scheduledAt: broadcast.scheduledAt, startedAt: broadcast.startedAt, endedAt: broadcast.endedAt, publicMetadata: null });
            if (!session) throw new YouTubeConnectionError('Select a session or provide a title for a new session.', 'SESSION_REQUIRED');
            let stream = await Stream.query(trx).findOne({ sourceId: connection.sourceId, externalId: broadcast.id });
            const streamData = { sourceId: connection.sourceId, streamSessionId: session.id, externalId: broadcast.id, title: broadcast.title, status: broadcast.status === 'ended' ? 'offline' : broadcast.status, startedAt: broadcast.startedAt, endedAt: broadcast.endedAt };
            stream = stream ? await Stream.query(trx).patchAndFetchById(stream.id, streamData) : await Stream.query(trx).insert(streamData);
            const sync = { streamId: stream.id, providerConnectionId: connection.id, providerBroadcastId: broadcast.id, providerStatus: broadcast.status, lastSynchronizedAt: new Date().toISOString(), lastErrorCode: null };
            await ProviderBroadcastSync.query(trx).insert(sync).onConflict('streamId').merge(sync);
            return stream;
        });
    }
    async synchronize(actorUserId, streamerId, connectionId) { const connection = await this.connection(actorUserId, streamerId, connectionId); const rows = await this.server.models().ProviderBroadcastSync.query().where({ providerConnectionId: connection.id }); for (const row of rows) { try { await this.select(actorUserId, streamerId, connection.id, row.providerBroadcastId, (await this.server.models().Stream.query().findById(row.streamId))?.streamSessionId); } catch (error) { if (error.code === 'BROADCAST_DELETED') await this.server.models().ProviderBroadcastSync.query().patchAndFetchById(row.streamId, { providerStatus: 'deleted', lastErrorCode: error.code, lastSynchronizedAt: new Date().toISOString() }); else throw error; } } return { synchronized: rows.length }; }
    async handleProviderError(connection, error) { if (error.code === 'TOKEN_REVOKED') await this.server.models().ProviderConnection.query().patchAndFetchById(connection.id, { status: 'reconnect_required', reconnectReason: 'token_revoked', updatedAt: new Date().toISOString() }); }
};
module.exports.YouTubeConnectionError = YouTubeConnectionError;
