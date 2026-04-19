const AVATARS = [
    { bg: 'rgba(91,95,239,0.16)', fg: '#99a0ff' },
    { bg: 'rgba(52,211,153,0.16)', fg: '#6ee7b7' },
    { bg: 'rgba(248,113,113,0.16)', fg: '#fca5a5' },
    { bg: 'rgba(251,191,36,0.16)', fg: '#fcd34d' },
    { bg: 'rgba(34,211,238,0.16)', fg: '#67e8f9' },
    { bg: 'rgba(244,114,182,0.16)', fg: '#f9a8d4' },
];

export function escHtml(value = '') {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

export function escAttr(value = '') {
    return escHtml(value).replace(/'/g, '&#39;');
}

export function hashString(value = '') {
    let hash = 0;
    for (let index = 0; index < value.length; index += 1) {
        hash = value.charCodeAt(index) + ((hash << 5) - hash);
    }
    return Math.abs(hash);
}

export function getAvatarPalette(seed = '') {
    return AVATARS[hashString(seed) % AVATARS.length];
}

export function getInitials(value = '') {
    const words = value.trim().split(/\s+/).filter(Boolean);
    if (words.length >= 2) return `${words[0][0]}${words[1][0]}`.toUpperCase();
    return value.trim().slice(0, 2).toUpperCase() || '?';
}

export function formatDateTime(value) {
    if (!value) return 'Never';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Unknown';

    return new Intl.DateTimeFormat(undefined, {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
    }).format(date);
}

export function formatCount(count, singular, plural) {
    return `${count} ${count === 1 ? singular : plural}`;
}

export async function copyText(value) {
    try {
        await navigator.clipboard.writeText(value);
        return true;
    } catch {
        const textarea = document.createElement('textarea');
        textarea.value = value;
        textarea.setAttribute('readonly', 'true');
        textarea.style.position = 'absolute';
        textarea.style.left = '-9999px';
        document.body.appendChild(textarea);
        textarea.select();
        const result = document.execCommand('copy');
        textarea.remove();
        return result;
    }
}

export function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function sanitizeClientFilename(filename = 'document.md') {
    let safe = String(filename)
        .replace(/[<>:"/\\|?*\x00-\x1F]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    if (!safe) safe = 'document.md';
    if (!safe.toLowerCase().endsWith('.md')) safe = `${safe}.md`;
    return safe;
}

export function tryParseJson(text, fallback = null) {
    try {
        return { value: JSON.parse(text), error: null };
    } catch (error) {
        return { value: fallback, error };
    }
}

export function prettyJson(value) {
    return JSON.stringify(value, null, 2);
}

export function parseTagsInput(value = '') {
    return [...new Set(
        value
            .split(/[,\n]/)
            .map(item => item.trim())
            .filter(Boolean),
    )];
}

export function interpolateTemplate(template = '', variables = {}) {
    return template.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_, key) => {
        const replacement = variables[key];
        return replacement === undefined || replacement === null ? '' : String(replacement);
    });
}

export function renderPromptPreview(prompt) {
    const vars = prompt.exampleVariables || {};

    if (prompt.format === 'chat') {
        return (prompt.messages || [])
            .map(message => `${message.role.toUpperCase()}\n${interpolateTemplate(message.content || '', vars)}`)
            .join('\n\n');
    }

    return interpolateTemplate(prompt.template || '', vars);
}

export function getPromptTemplateText(prompt) {
    if (prompt.format === 'chat') {
        return (prompt.messages || [])
            .map(message => `${message.role.toUpperCase()}: ${message.content || ''}`)
            .join('\n');
    }

    return prompt.template || '';
}

export function getStatusTone(status) {
    if (status === 'online') return 'success';
    if (status === 'offline') return 'danger';
    return 'neutral';
}

export function getSchemaDefault(schema = {}) {
    if (schema.default !== undefined) return schema.default;
    if (schema.example !== undefined) return schema.example;
    if (Array.isArray(schema.examples) && schema.examples.length) return schema.examples[0];
    return undefined;
}
