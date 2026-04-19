const path = require('path');
const { pathToFileURL } = require('url');

const { Client } = require('@modelcontextprotocol/sdk/client');
const { StdioClientTransport, getDefaultEnvironment } = require('@modelcontextprotocol/sdk/client/stdio.js');
const { SSEClientTransport } = require('@modelcontextprotocol/sdk/client/sse.js');
const { StreamableHTTPClientTransport } = require('@modelcontextprotocol/sdk/client/streamableHttp.js');
const { AjvJsonSchemaValidator } = require('@modelcontextprotocol/sdk/validation/ajv');
const { ListRootsRequestSchema } = require('@modelcontextprotocol/sdk/types.js');

const packageJson = require('../package.json');

function buildHeaders(server) {
    const headers = {};

    (server.headers || []).forEach(entry => {
        if (entry.key) headers[entry.key] = entry.value || '';
    });

    if (server.bearerToken) {
        headers.Authorization = `Bearer ${server.bearerToken}`;
    }

    return headers;
}

function buildStdioEnv(server) {
    const env = {
        ...getDefaultEnvironment(),
    };

    (server.env || []).forEach(entry => {
        if (entry.key) env[entry.key] = entry.value || '';
    });

    return env;
}

function buildSseFetch(headers) {
    return (url, init) => fetch(url, {
        ...init,
        headers: {
            ...(init?.headers || {}),
            ...headers,
        },
    });
}

function createClientForServer(server) {
    const hasRoots = Array.isArray(server.roots) && server.roots.length > 0;
    const client = new Client(
        {
            name: 'vibe-launcher',
            version: packageJson.version,
        },
        {
            capabilities: hasRoots ? { roots: {} } : {},
            jsonSchemaValidator: new AjvJsonSchemaValidator(),
        },
    );

    if (hasRoots) {
        client.setRequestHandler(ListRootsRequestSchema, async () => ({
            roots: server.roots.map(root => ({
                uri: pathToFileURL(root).href,
                name: path.basename(root) || root,
            })),
        }));
    }

    return client;
}

function buildRequestOptions(server) {
    const timeout = Number.isFinite(server?.timeout) && server.timeout > 0
        ? server.timeout
        : null;

    return timeout ? { timeout } : undefined;
}

function shouldFallbackToSse(error) {
    const code = typeof error?.code === 'number' ? error.code : null;
    return code !== null && code >= 400 && code < 500;
}

function summarizeError(error, stderrBuffer = [], server) {
    const parts = [];

    if (error?.code === 'ENOENT' && server?.command) {
        parts.push(`Command "${server.command}" was not found on PATH.`);
    }

    if (error?.message) parts.push(error.message);

    const stderrText = stderrBuffer
        .join('')
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(Boolean)
        .slice(-4)
        .join(' | ');

    if (stderrText && !parts.some(part => part.includes(stderrText))) {
        parts.push(stderrText);
    }

    return parts.join(' - ') || 'Unable to connect to MCP server.';
}

async function openConnection(server, forcedTransport) {
    const selectedTransport = forcedTransport || server.transport;
    const headers = buildHeaders(server);
    const stderrBuffer = [];
    const client = createClientForServer(server);
    const requestOptions = buildRequestOptions(server);
    let transport;

    if (selectedTransport === 'stdio') {
        transport = new StdioClientTransport({
            command: server.command,
            args: server.args || [],
            cwd: server.cwd || undefined,
            env: buildStdioEnv(server),
            stderr: 'pipe',
        });

        if (transport.stderr) {
            transport.stderr.on('data', chunk => {
                stderrBuffer.push(chunk.toString('utf8'));
            });
        }
    } else if (selectedTransport === 'sse') {
        transport = new SSEClientTransport(new URL(server.url), {
            requestInit: { headers },
            eventSourceInit: { fetch: buildSseFetch(headers) },
        });
    } else {
        transport = new StreamableHTTPClientTransport(new URL(server.url), {
            requestInit: { headers },
        });
    }

    await client.connect(transport, requestOptions);
    return { client, transport, resolvedTransport: selectedTransport, stderrBuffer, requestOptions };
}

async function withConnection(server, callback) {
    let connection;

    try {
        try {
            connection = await openConnection(server);
        } catch (error) {
            if (server.transport === 'streamable-http' && shouldFallbackToSse(error)) {
                connection = await openConnection(server, 'sse');
            } else {
                throw error;
            }
        }

        return await callback(connection);
    } catch (error) {
        const message = summarizeError(error, connection?.stderrBuffer, server);
        const wrapped = new Error(message);
        wrapped.original = error;
        throw wrapped;
    } finally {
        if (connection?.transport?.close) {
            try {
                await connection.transport.close();
            } catch {
                // ignore close errors
            }
        }
    }
}

function normalizeTool(tool) {
    return {
        name: tool.name,
        title: tool.title || '',
        description: tool.description || '',
        inputSchema: tool.inputSchema || { type: 'object', properties: {}, required: [] },
        outputSchema: tool.outputSchema || null,
        annotations: tool.annotations || {},
        execution: tool.execution || {},
    };
}

function normalizeContentItem(item) {
    if (!item || typeof item !== 'object') return { type: 'unknown' };

    if (item.type === 'text') {
        return { type: 'text', text: item.text || '' };
    }

    if (item.type === 'image') {
        return {
            type: 'image',
            mimeType: item.mimeType || '',
            size: item.data ? item.data.length : 0,
        };
    }

    if (item.type === 'audio') {
        return {
            type: 'audio',
            mimeType: item.mimeType || '',
            size: item.data ? item.data.length : 0,
        };
    }

    if (item.type === 'resource') {
        const resource = item.resource || {};
        return {
            type: 'resource',
            uri: resource.uri || '',
            mimeType: resource.mimeType || '',
            text: resource.text || '',
        };
    }

    if (item.type === 'resource_link') {
        return {
            type: 'resource_link',
            uri: item.uri || '',
            name: item.name || '',
            title: item.title || '',
            mimeType: item.mimeType || '',
            description: item.description || '',
        };
    }

    return { type: item.type || 'unknown' };
}

function normalizeToolResult(result) {
    const content = Array.isArray(result.content) ? result.content.map(normalizeContentItem) : [];
    const textOutput = content
        .filter(item => item.type === 'text')
        .map(item => item.text)
        .join('\n\n');

    return {
        isError: Boolean(result.isError),
        textOutput,
        structuredContent: result.structuredContent || null,
        content,
        raw: result,
    };
}

function buildCapabilitySummary(client) {
    const capabilities = client.getServerCapabilities() || {};
    return {
        tools: Boolean(capabilities.tools),
        prompts: Boolean(capabilities.prompts),
        resources: Boolean(capabilities.resources),
        logging: Boolean(capabilities.logging),
    };
}

async function discoverServer(server) {
    return withConnection(server, async ({ client, resolvedTransport, requestOptions }) => {
        const toolList = await client.listTools(undefined, requestOptions);
        const tools = (toolList.tools || []).map(normalizeTool);
        const serverInfo = client.getServerVersion() || {};

        return {
            resolvedTransport,
            tools,
            capabilities: buildCapabilitySummary(client),
            serverInfo,
        };
    });
}

async function invokeTool(server, toolName, args = {}) {
    return withConnection(server, async ({ client, resolvedTransport, requestOptions }) => {
        const result = await client.callTool({
            name: toolName,
            arguments: args,
        }, undefined, requestOptions);

        return {
            resolvedTransport,
            result: normalizeToolResult(result),
        };
    });
}

module.exports = {
    discoverServer,
    invokeTool,
};
