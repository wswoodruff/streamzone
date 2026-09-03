'use strict';

const Crypto = require('node:crypto');
const Util = require('node:util');
const Schmervice = require('@hapipal/schmervice');

const scrypt = Util.promisify(Crypto.scrypt);
const SESSION_LIFETIME = 7 * 24 * 60 * 60 * 1000;

module.exports = class AuthService extends Schmervice.Service {
    async register({ email, displayName, password }) {
        const { User } = this.server.models();
        const normalizedEmail = email.trim().toLowerCase();

        if (await User.query().findOne({ email: normalizedEmail })) {
            return null;
        }

        return User.query().insert({
            email: normalizedEmail,
            displayName,
            passwordHash: await this.hashPassword(password)
        });
    }

    async login(email, password) {
        const { User } = this.server.models();
        const user = await User.query().findOne({ email: email.trim().toLowerCase() });

        if (!user || !await this.verifyPassword(password, user.passwordHash)) {
            return null;
        }

        return { user, token: await this.createSession(user.id) };
    }

    async createSession(userId) {
        const { Session } = this.server.models();
        const token = Crypto.randomBytes(32).toString('hex');

        await Session.query().insert({
            id: this.digestToken(token),
            userId,
            expiresAt: new Date(Date.now() + SESSION_LIFETIME).toISOString()
        });

        return token;
    }

    async validateSession(session) {
        if (!session || typeof session.token !== 'string') {
            return { isValid: false };
        }

        const { Session } = this.server.models();
        const stored = await Session.query()
            .findById(this.digestToken(session.token))
            .withGraphFetched('user');

        if (!stored || new Date(stored.expiresAt) <= new Date()) {
            return { isValid: false };
        }

        return { isValid: true, credentials: stored.user, artifacts: { sessionId: stored.id } };
    }

    async logout(token) {
        if (token) {
            const { Session } = this.server.models();
            await Session.query().deleteById(this.digestToken(token));
        }
    }

    async hashPassword(password) {
        const salt = Crypto.randomBytes(16);
        const derived = await scrypt(password, salt, 64);

        return `scrypt:${salt.toString('hex')}:${derived.toString('hex')}`;
    }

    async verifyPassword(password, encoded) {
        const [algorithm, saltHex, hashHex] = (encoded || '').split(':');

        if (algorithm !== 'scrypt' || !saltHex || !hashHex) {
            return false;
        }

        const expected = Buffer.from(hashHex, 'hex');
        const actual = await scrypt(password, Buffer.from(saltHex, 'hex'), expected.length);

        return expected.length === actual.length && Crypto.timingSafeEqual(expected, actual);
    }

    digestToken(token) {
        return Crypto.createHash('sha256').update(token).digest('hex');
    }
};
