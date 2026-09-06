'use strict';

const { CHAT_ROLES } = require('../runtime/chat-roles');

const COOLDOWN_SCOPES = Object.freeze(['global', 'streamer', 'session', 'participant']);
const notices = Object.freeze({
    created: 'Command created.',
    updated: 'Command updated.',
    enabled: 'Command enabled.',
    disabled: 'Command disabled.',
    deleted: 'Command deleted.'
});

const titleCase = (value) => value ? value.charAt(0).toUpperCase() + value.slice(1) : '';
const options = (values, selected) => values.map((value) => ({ value, label: titleCase(value), selected: value === selected }));

const form = (values = {}, state = {}) => {
    const data = {
        name: values.name ?? '',
        responseTemplate: values.responseTemplate ?? '',
        cooldownSeconds: values.cooldownSeconds ?? 0,
        cooldownScope: values.cooldownScope ?? 'streamer',
        requiredChatRole: values.requiredChatRole ?? 'everyone'
    };

    return {
        ...data,
        error: state.error || null,
        fieldErrors: state.fieldErrors || {},
        cooldownScopes: options(COOLDOWN_SCOPES, data.cooldownScope),
        chatRoles: options(CHAT_ROLES, data.requiredChatRole)
    };
};

exports.build = async ({ services, userId, streamerId, canManage, commandStatus, formState }) => {
    const commands = await services.streamingService.listCommands(userId, streamerId, 'readManagement', { includeDisabled: true });
    const base = `/dashboard/streamers/${streamerId}/commands`;
    const editingId = formState?.mode === 'edit' ? Number(formState.commandId) : null;

    const items = commands.map((command) => {
        const editing = editingId === command.id;
        const values = editing ? { ...command, ...formState.values } : command;

        return {
            id: command.id,
            name: command.name,
            responseTemplate: command.responseTemplate,
            enabled: command.enabled,
            statusLabel: command.enabled ? 'Enabled' : 'Disabled',
            roleLabel: titleCase(command.requiredChatRole),
            cooldownLabel: command.cooldownSeconds ? `${command.cooldownSeconds}s ${command.cooldownScope}` : 'No cooldown',
            editOpen: editing,
            editForm: form(values, editing ? formState : {}),
            updateAction: `${base}/${command.id}`,
            toggleAction: `${base}/${command.id}/toggle`,
            deleteAction: `${base}/${command.id}/delete`,
            toggleValue: command.enabled ? 'false' : 'true',
            toggleLabel: command.enabled ? 'Disable' : 'Enable'
        };
    });

    return {
        total: commands.length,
        enabled: commands.filter((command) => command.enabled).length,
        disabled: commands.filter((command) => !command.enabled).length,
        items,
        canManage,
        createAction: base,
        createForm: form(formState?.mode === 'create' ? formState.values : {}, formState?.mode === 'create' ? formState : {}),
        notice: notices[commandStatus] || null
    };
};

exports.COOLDOWN_SCOPES = COOLDOWN_SCOPES;
