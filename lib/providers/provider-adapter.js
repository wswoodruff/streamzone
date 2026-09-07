'use strict';
class ProviderAdapterError extends Error { constructor(message, code, statusCode = 502) { super(message); this.name = 'ProviderAdapterError'; this.code = code; this.statusCode = statusCode; } }
class ProviderAdapter { async getChannelIdentity() { throw new Error('getChannelIdentity() must be implemented'); } async discoverBroadcasts() { throw new Error('discoverBroadcasts() must be implemented'); } async getBroadcast() { throw new Error('getBroadcast() must be implemented'); } }
module.exports = { ProviderAdapter, ProviderAdapterError };
