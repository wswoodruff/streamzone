'use strict';
const Crypto = require('node:crypto');
const Schmervice = require('@hapipal/schmervice');
const { loadOAuthEnvironment } = require('../config/environment');

module.exports = class CredentialEncryptionService extends Schmervice.Service {
    configuration() { return this.options || loadOAuthEnvironment(); }
    encrypt(plaintext, context) {
        if (!plaintext) return null;
        const { encryptionKey, keyVersion } = this.configuration();
        const iv = Crypto.randomBytes(12);
        const cipher = Crypto.createCipheriv('aes-256-gcm', encryptionKey, iv);
        cipher.setAAD(Buffer.from(String(context)));
        const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
        return `${keyVersion}.${iv.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${encrypted.toString('base64url')}`;
    }
    decrypt(envelope, context) {
        if (!envelope) return null;
        const { encryptionKey, keyVersion } = this.configuration();
        const [version, iv, tag, encrypted] = envelope.split('.');
        if (version !== keyVersion || !encrypted) throw new Error('Credential key version is unavailable.');
        const decipher = Crypto.createDecipheriv('aes-256-gcm', encryptionKey, Buffer.from(iv, 'base64url'));
        decipher.setAAD(Buffer.from(String(context)));
        decipher.setAuthTag(Buffer.from(tag, 'base64url'));
        return Buffer.concat([decipher.update(Buffer.from(encrypted, 'base64url')), decipher.final()]).toString('utf8');
    }
};
