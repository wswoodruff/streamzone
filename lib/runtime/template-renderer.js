'use strict';

const VARIABLES = new Set(['user', 'username', 'args', 'command', 'provider']);
const TOKEN = /{{\s*([a-zA-Z][a-zA-Z0-9_]*)\s*}}/g;

exports.renderCommandTemplate = (template, values, { maxLength = 200 } = {}) => {
    const unknown = new Set();
    const text = String(template).replace(TOKEN, (raw, name) => {
        if (!VARIABLES.has(name)) { unknown.add(name); return raw; }
        return String(values[name] ?? '');
    });
    if (unknown.size) throw Object.assign(new Error(`Unsupported template variable(s): ${[...unknown].join(', ')}`), { code: 'COMMAND_TEMPLATE_VARIABLE_UNSUPPORTED' });
    if (!text.length || text.length > maxLength) throw Object.assign(new Error(`Rendered command output must be 1-${maxLength} characters.`), { code: 'COMMAND_OUTPUT_LIMIT' });
    return text;
};
exports.VARIABLES = VARIABLES;
