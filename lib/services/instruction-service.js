'use strict';

const Schmervice = require('@hapipal/schmervice');

class InstructionError extends Error {
    constructor(code, message, httpStatus = 409) { super(message); this.name = 'InstructionError'; this.code = code; this.httpStatus = httpStatus; }
}

const deterministicFindings = (instruction) => {
    const findings = [];
    if (!instruction.trim()) findings.push({ code: 'EMPTY', severity: 'error', message: 'Instruction cannot be empty.' });
    if (/\b(?:reveal|return|print)\b.{0,40}\b(?:system|platform|hidden)\s+(?:prompt|instruction)/i.test(instruction)) findings.push({ code: 'SECRET_EXTRACTION', severity: 'error', message: 'Instruction requests protected platform data.' });
    if (/\b(?:always|never|must)\b/i.test(instruction)) findings.push({ code: 'ABSOLUTE_LANGUAGE', severity: 'warning', message: 'Review absolute language for unintended behavior.' });
    return findings;
};

module.exports = class InstructionService extends Schmervice.Service {
    async createDraft(userId, streamerId, instruction, basedOnVersionId = null) {
        await this.server.services().authorizationService.requireCapability(userId, streamerId, 'editAiInstructions');
        if (basedOnVersionId && !await this._find(streamerId, basedOnVersionId)) throw new InstructionError('VERSION_NOT_FOUND', 'Instruction version not found.', 404);
        return this.server.models().StreamerInstructionVersion.query().insert({ streamerId, instruction, status: 'draft', createdBy: userId, basedOnVersionId });
    }

    async updateDraft(userId, streamerId, versionId, instruction) {
        await this.server.services().authorizationService.requireCapability(userId, streamerId, 'editAiInstructions');
        const row = await this._find(streamerId, versionId);
        if (!row) throw new InstructionError('VERSION_NOT_FOUND', 'Instruction version not found.', 404);
        if (!['draft', 'approved', 'rejected'].includes(row.status)) throw new InstructionError('IMMUTABLE_VERSION', 'Published versions are immutable.');
        const now = new Date().toISOString();
        return this.server.models().StreamerInstructionVersion.query().patchAndFetchById(versionId, {
            instruction, status: 'draft', revision: row.revision + 1, validatedRevision: null, findings: null, policyVersion: null,
            checkerVersion: null, reviewedBy: null, reviewedAt: null, warningsAcknowledgedAt: null, warningsAcknowledgedBy: null, updatedAt: now
        });
    }

    async requestValidation(userId, streamerId, versionId) {
        await this.server.services().authorizationService.requireCapability(userId, streamerId, 'editAiInstructions');
        const row = await this._find(streamerId, versionId);
        if (!row) throw new InstructionError('VERSION_NOT_FOUND', 'Instruction version not found.', 404);
        if (row.status !== 'draft') throw new InstructionError('INVALID_STATE', 'Only drafts can be validated.');
        const checkerVersion = this.options?.checkerVersion || 'deterministic-v1';
        const policyVersion = this.options?.policyVersion || 'platform-policy-v1';
        let findings = deterministicFindings(row.instruction);
        // The injected classifier receives creator content only; platform instructions are never persisted or returned.
        if (!findings.some((item) => item.severity === 'error') && this.options?.classifier) {
            const result = await this.options.classifier.classify({ instruction: row.instruction, policyVersion });
            findings = findings.concat((result?.findings || []).map(({ code, severity, message }) => ({ code, severity, message })));
            if (result?.allowed === false && !findings.some((item) => item.severity === 'error')) findings.push({ code: 'CLASSIFIER_REJECTED', severity: 'error', message: 'Instruction violates platform policy.' });
        }
        const now = new Date().toISOString();
        const status = findings.some((item) => item.severity === 'error') ? 'rejected' : 'approved';
        return this.server.models().StreamerInstructionVersion.query().patchAndFetchById(versionId, { status, validatedRevision: row.revision, findings, policyVersion, checkerVersion, reviewedBy: userId, validationRequestedAt: now, reviewedAt: now, updatedAt: now });
    }

    async acknowledgeWarnings(userId, streamerId, versionId) {
        await this.server.services().authorizationService.requireCapability(userId, streamerId, 'editAiInstructions');
        const row = await this._find(streamerId, versionId);
        if (!row) throw new InstructionError('VERSION_NOT_FOUND', 'Instruction version not found.', 404);
        if (row.status !== 'approved' || row.validatedRevision !== row.revision) throw new InstructionError('STALE_APPROVAL', 'Version must have a current approval.');
        const now = new Date().toISOString();
        return this.server.models().StreamerInstructionVersion.query().patchAndFetchById(versionId, { warningsAcknowledgedAt: now, warningsAcknowledgedBy: userId, updatedAt: now });
    }

    async publish(userId, streamerId, versionId) {
        await this.server.services().authorizationService.requireCapability(userId, streamerId, 'publishAiInstructions');
        const { StreamerInstructionVersion } = this.server.models();
        return StreamerInstructionVersion.transaction(async (trx) => {
            const selected = await trx('StreamerInstructionVersion').where({ id: versionId, streamerId }).forUpdate().first();
            if (!selected) throw new InstructionError('VERSION_NOT_FOUND', 'Instruction version not found.', 404);
            if (selected.status === 'rejected') throw new InstructionError('REJECTED_VERSION', 'Rejected versions cannot be published.');
            if (selected.status !== 'approved' || selected.validatedRevision !== selected.revision) throw new InstructionError('STALE_APPROVAL', 'Version must have a current approval.');
            const findings = typeof selected.findings === 'string' ? JSON.parse(selected.findings) : (selected.findings || []);
            if (findings.some((item) => item.severity === 'warning') && !selected.warningsAcknowledgedAt) throw new InstructionError('WARNINGS_NOT_ACKNOWLEDGED', 'Warnings must be acknowledged before publishing.');
            const now = new Date().toISOString();
            await trx('StreamerInstructionVersion').where({ streamerId, status: 'active' }).update({ status: 'superseded', supersededAt: now, updatedAt: now });
            await trx('StreamerInstructionVersion').where({ id: versionId, streamerId, status: 'approved' }).update({ status: 'active', publishedBy: userId, publishedAt: now, supersededAt: null, updatedAt: now });
            return StreamerInstructionVersion.query(trx).findById(versionId);
        });
    }

    async rollback(userId, streamerId, versionId) {
        await this.server.services().authorizationService.requireCapability(userId, streamerId, 'publishAiInstructions');
        const source = await this._find(streamerId, versionId);
        if (!source) throw new InstructionError('VERSION_NOT_FOUND', 'Instruction version not found.', 404);
        if (!['active', 'superseded'].includes(source.status)) throw new InstructionError('INVALID_ROLLBACK', 'Only a previously published version can be rolled back.');
        const draft = await this.createDraft(userId, streamerId, source.instruction, source.id);
        const approved = await this.requestValidation(userId, streamerId, draft.id);
        if (approved.status !== 'approved') throw new InstructionError('ROLLBACK_REJECTED', 'The current policy rejects this rollback target.');
        if ((approved.findings || []).some((item) => item.severity === 'warning')) await this.acknowledgeWarnings(userId, streamerId, approved.id);
        return this.publish(userId, streamerId, approved.id);
    }

    async list(userId, streamerId) {
        await this.server.services().authorizationService.requireCapability(userId, streamerId, 'readManagement');
        return this.server.models().StreamerInstructionVersion.query().where({ streamerId }).orderBy('id', 'desc');
    }
    _find(streamerId, id) { return this.server.models().StreamerInstructionVersion.query().findOne({ id, streamerId }); }
};

module.exports.InstructionError = InstructionError;
module.exports.deterministicFindings = deterministicFindings;
