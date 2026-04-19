const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '..', 'projects.json');
const STATUS_VALUES = new Set(['unknown', 'online', 'offline']);
const TRANSPORT_VALUES = new Set(['streamable-http', 'sse', 'stdio']);
const PROMPT_FORMATS = new Set(['text', 'chat']);

function nowIso() {
    return new Date().toISOString();
}

function createId(prefix = 'item') {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeString(value, fallback = '') {
    return typeof value === 'string' ? value.trim() : fallback;
}

function normalizeMultilineString(value, fallback = '') {
    return typeof value === 'string' ? value.replace(/\r\n/g, '\n').trim() : fallback;
}

function normalizeBoolean(value, fallback = false) {
    return typeof value === 'boolean' ? value : fallback;
}

function normalizeArray(value) {
    return Array.isArray(value) ? value : [];
}

function isPlainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function uniqueStrings(values) {
    return [...new Set(normalizeArray(values).map(item => normalizeString(item)).filter(Boolean))];
}

function normalizeKeyValueArray(value) {
    if (isPlainObject(value)) {
        return Object.entries(value)
            .map(([key, entryValue]) => ({
                key: normalizeString(key),
                value: entryValue === undefined || entryValue === null ? '' : String(entryValue),
            }))
            .filter(entry => entry.key);
    }

    return normalizeArray(value)
        .map(entry => ({
            key: normalizeString(entry?.key),
            value: entry?.value === undefined || entry?.value === null ? '' : String(entry.value),
        }))
        .filter(entry => entry.key);
}

function normalizeCommandArgs(value) {
    return normalizeArray(value)
        .map(item => typeof item === 'string' ? item.trim() : '')
        .filter(Boolean);
}

function normalizeJsonRecord(value, fallback = {}) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return fallback;
    return value;
}

function normalizePositiveInteger(value, fallback = null) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return fallback;
    const rounded = Math.round(numeric);
    return rounded > 0 ? rounded : fallback;
}

function normalizeProject(project = {}) {
    return {
        id: normalizeString(project.id) || createId('project'),
        name: normalizeString(project.name) || 'Unnamed Project',
        path: typeof project.path === 'string' ? project.path.trim() : '',
        logo: typeof project.logo === 'string' ? project.logo.trim() : '',
        ide: normalizeString(project.ide) || 'code',
        categories: uniqueStrings(project.categories || (project.category ? [project.category] : [])),
        commands: normalizeArray(project.commands)
            .map(command => ({
                name: normalizeString(command?.name),
                cmd: typeof command?.cmd === 'string' ? command.cmd.trim() : '',
            }))
            .filter(command => command.name && command.cmd),
        notes: normalizeMultilineString(project.notes),
        pinned: normalizeBoolean(project.pinned),
        linkedPrompts: uniqueStrings(project.linkedPrompts),
        linkedMarkdown: uniqueStrings(project.linkedMarkdown),
        runCount: Number.isFinite(project.runCount) ? project.runCount : 0,
        lastRunAt: normalizeString(project.lastRunAt) || '',
        createdAt: normalizeString(project.createdAt) || new Date().toISOString(),
    };
}

function normalizeToolDefinition(tool = {}) {
    return {
        name: normalizeString(tool.name),
        title: normalizeString(tool.title),
        description: normalizeMultilineString(tool.description),
        inputSchema: normalizeJsonRecord(tool.inputSchema, { type: 'object', properties: {}, required: [] }),
        outputSchema: tool.outputSchema ? normalizeJsonRecord(tool.outputSchema, { type: 'object', properties: {}, required: [] }) : null,
        annotations: normalizeJsonRecord(tool.annotations, {}),
        execution: normalizeJsonRecord(tool.execution, {}),
    };
}

function normalizeMcpHistoryEntry(entry = {}) {
    return {
        id: normalizeString(entry.id) || createId('mcp_run'),
        toolName: normalizeString(entry.toolName),
        timestamp: normalizeString(entry.timestamp) || nowIso(),
        success: normalizeBoolean(entry.success),
        arguments: normalizeJsonRecord(entry.arguments, {}),
        preview: normalizeString(entry.preview),
        result: normalizeJsonRecord(entry.result, {}),
    };
}

function normalizeMcpServer(server = {}, existing, options = {}) {
    const now = nowIso();
    const touch = options.touch === true;
    const resolvedTransport = TRANSPORT_VALUES.has(server.transport)
        ? server.transport
        : (existing?.transport || (server.url ? 'streamable-http' : 'stdio'));

    return {
        id: normalizeString(existing?.id || server.id) || createId('mcp'),
        name: normalizeString(server.name, existing?.name) || 'Untitled MCP Server',
        description: normalizeMultilineString(server.description, existing?.description),
        transport: resolvedTransport,
        url: typeof server.url === 'string' ? server.url.trim() : (existing?.url || ''),
        command: typeof server.command === 'string' ? server.command.trim() : (existing?.command || ''),
        args: normalizeCommandArgs(server.args !== undefined ? server.args : existing?.args),
        cwd: typeof server.cwd === 'string' ? server.cwd.trim() : (existing?.cwd || ''),
        timeout: normalizePositiveInteger(server.timeout, normalizePositiveInteger(existing?.timeout, null)),
        bearerToken: typeof server.bearerToken === 'string' ? server.bearerToken.trim() : (existing?.bearerToken || ''),
        headers: normalizeKeyValueArray(server.headers !== undefined ? server.headers : existing?.headers),
        env: normalizeKeyValueArray(server.env !== undefined ? server.env : existing?.env),
        roots: uniqueStrings(server.roots !== undefined ? server.roots : existing?.roots),
        notes: normalizeMultilineString(server.notes, existing?.notes),
        tools: normalizeArray(server.tools !== undefined ? server.tools : existing?.tools).map(normalizeToolDefinition).filter(tool => tool.name),
        capabilities: normalizeJsonRecord(server.capabilities !== undefined ? server.capabilities : existing?.capabilities, {}),
        serverInfo: normalizeJsonRecord(server.serverInfo !== undefined ? server.serverInfo : existing?.serverInfo, {}),
        lastStatus: STATUS_VALUES.has(server.lastStatus) ? server.lastStatus : (STATUS_VALUES.has(existing?.lastStatus) ? existing.lastStatus : 'unknown'),
        lastCheckedAt: normalizeString(server.lastCheckedAt, existing?.lastCheckedAt) || null,
        lastError: normalizeString(server.lastError, existing?.lastError),
        history: normalizeArray(server.history !== undefined ? server.history : existing?.history)
            .map(normalizeMcpHistoryEntry)
            .slice(0, 12),
        createdAt: normalizeString(existing?.createdAt || server.createdAt) || now,
        updatedAt: touch ? now : (normalizeString(server.updatedAt, existing?.updatedAt) || now),
    };
}

function normalizePromptMessage(message = {}, index = 0) {
    const role = ['system', 'user', 'assistant'].includes(message.role) ? message.role : 'user';
    return {
        id: normalizeString(message.id) || createId(`msg${index}`),
        role,
        content: normalizeMultilineString(message.content),
    };
}

function normalizePrompt(prompt = {}, existing, options = {}) {
    const now = nowIso();
    const touch = options.touch === true;
    const format = PROMPT_FORMATS.has(prompt.format) ? prompt.format : (existing?.format || 'text');
    const messages = normalizeArray(prompt.messages !== undefined ? prompt.messages : existing?.messages)
        .map(normalizePromptMessage)
        .filter(message => message.content);

    return {
        id: normalizeString(existing?.id || prompt.id) || createId('prompt'),
        title: normalizeString(prompt.title, existing?.title) || 'Untitled Prompt',
        description: normalizeMultilineString(prompt.description, existing?.description),
        tags: uniqueStrings(prompt.tags !== undefined ? prompt.tags : existing?.tags),
        format,
        template: format === 'text'
            ? normalizeMultilineString(prompt.template !== undefined ? prompt.template : existing?.template)
            : '',
        messages: format === 'chat' ? messages : [],
        exampleVariables: normalizeJsonRecord(prompt.exampleVariables !== undefined ? prompt.exampleVariables : existing?.exampleVariables, {}),
        exampleOutput: normalizeMultilineString(prompt.exampleOutput, existing?.exampleOutput),
        notes: normalizeMultilineString(prompt.notes, existing?.notes),
        favorite: normalizeBoolean(prompt.favorite, existing?.favorite),
        createdAt: normalizeString(existing?.createdAt || prompt.createdAt) || now,
        updatedAt: touch ? now : (normalizeString(prompt.updatedAt, existing?.updatedAt) || now),
    };
}

function normalizeMarkdownFile(markdownFile = {}, existing, options = {}) {
    const now = nowIso();
    const touch = options.touch === true;

    return {
        id: normalizeString(existing?.id || markdownFile.id) || createId('md'),
        title: normalizeString(markdownFile.title, existing?.title) || 'Untitled Markdown',
        filename: normalizeString(markdownFile.filename, existing?.filename) || 'document.md',
        storageName: normalizeString(markdownFile.storageName, existing?.storageName) || '',
        description: normalizeMultilineString(markdownFile.description, existing?.description),
        tags: uniqueStrings(markdownFile.tags !== undefined ? markdownFile.tags : existing?.tags),
        size: Number.isFinite(markdownFile.size) ? markdownFile.size : (Number.isFinite(existing?.size) ? existing.size : 0),
        excerpt: normalizeMultilineString(markdownFile.excerpt, existing?.excerpt).slice(0, 240),
        createdAt: normalizeString(existing?.createdAt || markdownFile.createdAt) || now,
        updatedAt: touch ? now : (normalizeString(markdownFile.updatedAt, existing?.updatedAt) || now),
    };
}

function deriveCategoriesFromProjects(projects) {
    return [...new Set(projects.flatMap(project => project.categories || []))].sort((a, b) => a.localeCompare(b));
}

function normalizeData(raw) {
    if (Array.isArray(raw)) {
        const projects = raw.map(normalizeProject);
        return {
            categories: deriveCategoriesFromProjects(projects),
            projects,
            mcpServers: [],
            prompts: [],
            markdownFiles: [],
        };
    }

    const projects = normalizeArray(raw?.projects).map(normalizeProject);
    const storedCategories = uniqueStrings(raw?.categories);
    const categories = [...new Set([...storedCategories, ...deriveCategoriesFromProjects(projects)])]
        .sort((a, b) => a.localeCompare(b));

    return {
        categories,
        projects,
        mcpServers: Array.isArray(raw?.mcpServers)
            ? raw.mcpServers.map(server => normalizeMcpServer(server, undefined, { touch: false }))
            : Object.entries(normalizeJsonRecord(raw?.mcpServers, {})).map(([name, server]) => normalizeMcpServer({
                ...(isPlainObject(server) ? server : {}),
                name: normalizeString(server?.name) || name,
            }, undefined, { touch: false })),
        prompts: normalizeArray(raw?.prompts).map(prompt => normalizePrompt(prompt, undefined, { touch: false })),
        markdownFiles: normalizeArray(raw?.markdownFiles).map(file => normalizeMarkdownFile(file, undefined, { touch: false })),
    };
}

function readData() {
    if (!fs.existsSync(DATA_FILE)) {
        return normalizeData({});
    }

    try {
        const raw = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
        return normalizeData(raw);
    } catch {
        return normalizeData({});
    }
}

function writeData(data) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(normalizeData(data), null, 2));
}

function pushMcpHistory(server, entry) {
    const history = [normalizeMcpHistoryEntry(entry), ...normalizeArray(server.history)].slice(0, 12);
    return {
        ...server,
        history,
        updatedAt: nowIso(),
    };
}

module.exports = {
    DATA_FILE,
    createId,
    normalizeData,
    normalizeProject,
    normalizeMcpServer,
    normalizePrompt,
    normalizeMarkdownFile,
    normalizeToolDefinition,
    pushMcpHistory,
    readData,
    writeData,
};
