#!/usr/bin/env node
const express = require('express');
const cors = require('cors');
const path = require('path');
const { exec } = require('child_process');

const {
    normalizeProject,
    normalizeMcpServer,
    normalizePrompt,
    normalizeMarkdownFile,
    pushMcpHistory,
    readData,
    writeData,
} = require('./lib/data-store');
const { discoverServer, invokeTool } = require('./lib/mcp-client');
const {
    deleteMarkdownFile,
    getMarkdownRecord,
    importMarkdownFiles,
    streamMarkdownZip,
    updateMarkdownFile,
} = require('./lib/markdown-store');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json({ limit: '12mb' }));
app.use(express.static(path.join(__dirname, 'public')));

function getData() {
    return readData();
}

function saveData(data) {
    writeData(data);
}

function sendNotFound(res, label) {
    return res.status(404).json({ error: `${label} not found` });
}

function updateCategoriesFromProjects(data) {
    const fromProjects = data.projects.flatMap(project => project.categories || []);
    data.categories = [...new Set([...(data.categories || []), ...fromProjects])].sort((a, b) => a.localeCompare(b));
}

function summarizeResultPreview(result) {
    if (result.textOutput) {
        return result.textOutput.slice(0, 140);
    }

    if (result.structuredContent) {
        return JSON.stringify(result.structuredContent).slice(0, 140);
    }

    return result.isError ? 'Tool returned an error result.' : 'Tool executed successfully.';
}

app.get('/api/bootstrap', (req, res) => {
    res.json(getData());
});

app.get('/api/categories', (req, res) => {
    res.json(getData().categories);
});

app.post('/api/categories', (req, res) => {
    const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
    if (!name) return res.status(400).json({ error: 'Name required' });

    const data = getData();
    if (!data.categories.includes(name)) {
        data.categories.push(name);
        data.categories.sort((a, b) => a.localeCompare(b));
        saveData(data);
    }

    res.json({ success: true, name });
});

app.delete('/api/categories/:name', (req, res) => {
    const name = decodeURIComponent(req.params.name);
    const data = getData();
    data.categories = data.categories.filter(category => category !== name);
    data.projects = data.projects.map(project => ({
        ...project,
        categories: (project.categories || []).filter(category => category !== name),
    }));
    saveData(data);
    res.json({ success: true });
});

app.get('/api/projects', (req, res) => {
    res.json(getData().projects);
});

app.post('/api/projects/reorder', (req, res) => {
    const { ids } = req.body;
    if (!Array.isArray(ids)) return res.status(400).json({ error: 'ids must be an array' });

    const data = getData();
    const ordered = ids.map(id => data.projects.find(project => project.id === id)).filter(Boolean);
    const remaining = data.projects.filter(project => !ids.includes(project.id));
    data.projects = [...ordered, ...remaining];
    saveData(data);
    res.json({ success: true });
});

app.post('/api/projects', (req, res) => {
    const data = getData();
    const project = normalizeProject(req.body);
    data.projects.push(project);
    updateCategoriesFromProjects(data);
    saveData(data);
    res.json(project);
});

app.put('/api/projects/:id', (req, res) => {
    const data = getData();
    const index = data.projects.findIndex(project => project.id === req.params.id);
    if (index === -1) return sendNotFound(res, 'Project');

    data.projects[index] = normalizeProject({
        ...data.projects[index],
        ...req.body,
        id: req.params.id,
    });
    updateCategoriesFromProjects(data);
    saveData(data);
    res.json(data.projects[index]);
});

app.delete('/api/projects/:id', (req, res) => {
    const data = getData();
    data.projects = data.projects.filter(project => project.id !== req.params.id);
    saveData(data);
    res.json({ success: true });
});

app.post('/api/projects/:id/execute', (req, res) => {
    const data = getData();
    const project = data.projects.find(item => item.id === req.params.id);
    if (!project) return sendNotFound(res, 'Project');

    const command = project.commands?.[req.body.commandIndex];
    if (!command) return res.status(400).json({ error: 'Command not found' });

    const uid = `VibeID:${project.id}-${req.body.commandIndex}`;
    exec(`start "" cmd.exe /k "echo ${uid} > nul && cd /d "${project.path}" && ${command.cmd}"`);
    res.json({ success: true });
});

app.post('/api/projects/:id/stop', (req, res) => {
    const { commandIndex, commandName } = req.body;
    const uid = `VibeID:${req.params.id}-${commandIndex}`;
    const psCmd = `powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"Name='cmd.exe' and CommandLine LIKE '%${uid}%'\\" | Select-Object -ExpandProperty ProcessId"`;

    exec(psCmd, (error, stdout) => {
        if (error || !stdout.trim()) {
            return res.json({ success: false, error: 'Process not found or already stopped.' });
        }

        const pids = stdout.trim().split('\n').map(pid => pid.trim()).filter(Boolean);
        if (!pids.length) return res.json({ success: false, error: 'Process not found.' });

        pids.forEach(pid => exec(`taskkill /PID ${pid} /T /F`));
        res.json({ success: true, message: `Stopped ${commandName || 'command'}` });
    });
});

app.post('/api/projects/:id/open-ide', (req, res) => {
    const data = getData();
    const project = data.projects.find(item => item.id === req.params.id);
    if (!project) return sendNotFound(res, 'Project');

    exec(`start "" cmd.exe /c "cd /d "${project.path}" && ${project.ide} ."`, error => {
        if (error) console.error(error);
    });

    res.json({ success: true });
});

app.get('/api/mcp-servers', (req, res) => {
    res.json(getData().mcpServers);
});

app.post('/api/mcp-servers', (req, res) => {
    const data = getData();
    const server = normalizeMcpServer(req.body, undefined, { touch: true });
    data.mcpServers.unshift(server);
    saveData(data);
    res.json(server);
});

app.put('/api/mcp-servers/:id', (req, res) => {
    const data = getData();
    const index = data.mcpServers.findIndex(server => server.id === req.params.id);
    if (index === -1) return sendNotFound(res, 'MCP server');

    data.mcpServers[index] = normalizeMcpServer(req.body, data.mcpServers[index], { touch: true });
    saveData(data);
    res.json(data.mcpServers[index]);
});

app.delete('/api/mcp-servers/:id', (req, res) => {
    const data = getData();
    data.mcpServers = data.mcpServers.filter(server => server.id !== req.params.id);
    saveData(data);
    res.json({ success: true });
});

app.post('/api/mcp-servers/:id/discover', async (req, res) => {
    const data = getData();
    const index = data.mcpServers.findIndex(server => server.id === req.params.id);
    if (index === -1) return sendNotFound(res, 'MCP server');

    try {
        const discovery = await discoverServer(data.mcpServers[index]);
        data.mcpServers[index] = normalizeMcpServer({
            ...data.mcpServers[index],
            transport: discovery.resolvedTransport,
            tools: discovery.tools,
            capabilities: discovery.capabilities,
            serverInfo: discovery.serverInfo,
            lastStatus: 'online',
            lastCheckedAt: new Date().toISOString(),
            lastError: '',
        }, data.mcpServers[index], { touch: true });
        saveData(data);
        res.json(data.mcpServers[index]);
    } catch (error) {
        data.mcpServers[index] = normalizeMcpServer({
            ...data.mcpServers[index],
            lastStatus: 'offline',
            lastCheckedAt: new Date().toISOString(),
            lastError: error.message || 'Failed to discover server.',
        }, data.mcpServers[index], { touch: true });
        saveData(data);
        res.status(502).json({
            error: error.message || 'Failed to discover server.',
            server: data.mcpServers[index],
        });
    }
});

app.post('/api/mcp-servers/:id/tools/:toolName/invoke', async (req, res) => {
    const data = getData();
    const index = data.mcpServers.findIndex(server => server.id === req.params.id);
    if (index === -1) return sendNotFound(res, 'MCP server');

    const toolName = decodeURIComponent(req.params.toolName);
    const args = req.body.arguments && typeof req.body.arguments === 'object' ? req.body.arguments : {};

    try {
        const invocation = await invokeTool(data.mcpServers[index], toolName, args);
        const historyEntry = {
            toolName,
            timestamp: new Date().toISOString(),
            success: !invocation.result.isError,
            arguments: args,
            preview: summarizeResultPreview(invocation.result),
            result: {
                isError: invocation.result.isError,
                textOutput: invocation.result.textOutput,
                structuredContent: invocation.result.structuredContent,
            },
        };

        data.mcpServers[index] = pushMcpHistory(normalizeMcpServer({
            ...data.mcpServers[index],
            transport: invocation.resolvedTransport,
            lastStatus: 'online',
            lastCheckedAt: historyEntry.timestamp,
            lastError: invocation.result.isError ? historyEntry.preview : '',
        }, data.mcpServers[index], { touch: true }), historyEntry);

        saveData(data);

        res.json({
            ...invocation.result,
            history: data.mcpServers[index].history,
        });
    } catch (error) {
        data.mcpServers[index] = normalizeMcpServer({
            ...data.mcpServers[index],
            lastStatus: 'offline',
            lastCheckedAt: new Date().toISOString(),
            lastError: error.message || 'Tool invocation failed.',
        }, data.mcpServers[index], { touch: true });
        saveData(data);

        res.status(502).json({
            error: error.message || 'Tool invocation failed.',
            server: data.mcpServers[index],
        });
    }
});

app.get('/api/prompts', (req, res) => {
    res.json(getData().prompts);
});

app.post('/api/prompts', (req, res) => {
    const data = getData();
    const prompt = normalizePrompt(req.body, undefined, { touch: true });
    data.prompts.unshift(prompt);
    saveData(data);
    res.json(prompt);
});

app.put('/api/prompts/:id', (req, res) => {
    const data = getData();
    const index = data.prompts.findIndex(prompt => prompt.id === req.params.id);
    if (index === -1) return sendNotFound(res, 'Prompt');

    data.prompts[index] = normalizePrompt(req.body, data.prompts[index], { touch: true });
    saveData(data);
    res.json(data.prompts[index]);
});

app.post('/api/prompts/:id/duplicate', (req, res) => {
    const data = getData();
    const prompt = data.prompts.find(item => item.id === req.params.id);
    if (!prompt) return sendNotFound(res, 'Prompt');

    const duplicated = normalizePrompt({
        ...prompt,
        id: undefined,
        title: `${prompt.title} Copy`,
        favorite: false,
        createdAt: undefined,
        updatedAt: undefined,
    }, undefined, { touch: true });

    data.prompts.unshift(duplicated);
    saveData(data);
    res.json(duplicated);
});

app.delete('/api/prompts/:id', (req, res) => {
    const data = getData();
    data.prompts = data.prompts.filter(prompt => prompt.id !== req.params.id);
    saveData(data);
    res.json({ success: true });
});

app.get('/api/markdown-files', (req, res) => {
    res.json(getData().markdownFiles);
});

app.post('/api/markdown-files/import', (req, res) => {
    const files = Array.isArray(req.body.files) ? req.body.files : [];
    if (!files.length) return res.status(400).json({ error: 'At least one markdown file is required.' });

    const imported = importMarkdownFiles(files, {
        tags: Array.isArray(req.body.tags) ? req.body.tags : [],
        description: typeof req.body.description === 'string' ? req.body.description : '',
    });

    if (!imported.length) return res.status(400).json({ error: 'No valid markdown files were provided.' });

    const data = getData();
    data.markdownFiles.unshift(...imported.map(file => normalizeMarkdownFile(file, undefined, { touch: false })));
    saveData(data);
    res.json(imported);
});

app.post('/api/markdown-files/batch', (req, res) => {
    const ids = Array.isArray(req.body.ids) ? req.body.ids : [];
    if (!ids.length) return res.status(400).json({ error: 'ids must be a non-empty array' });

    const files = getData().markdownFiles.filter(file => ids.includes(file.id)).map(getMarkdownRecord);
    res.json(files);
});

app.post('/api/markdown-files/export', (req, res) => {
    const ids = Array.isArray(req.body.ids) ? req.body.ids : [];
    if (!ids.length) return res.status(400).json({ error: 'ids must be a non-empty array' });

    const files = getData().markdownFiles.filter(file => ids.includes(file.id));
    if (!files.length) return res.status(404).json({ error: 'No markdown files found for export.' });
    streamMarkdownZip(files, res);
});

app.get('/api/markdown-files/:id', (req, res) => {
    const file = getData().markdownFiles.find(item => item.id === req.params.id);
    if (!file) return sendNotFound(res, 'Markdown file');
    res.json(getMarkdownRecord(file));
});

app.put('/api/markdown-files/:id', (req, res) => {
    const data = getData();
    const index = data.markdownFiles.findIndex(file => file.id === req.params.id);
    if (index === -1) return sendNotFound(res, 'Markdown file');

    const updated = updateMarkdownFile(data.markdownFiles[index], req.body);
    data.markdownFiles[index] = normalizeMarkdownFile(updated, data.markdownFiles[index], { touch: false });
    saveData(data);
    res.json(data.markdownFiles[index]);
});

app.delete('/api/markdown-files/:id', (req, res) => {
    const data = getData();
    const file = data.markdownFiles.find(item => item.id === req.params.id);
    if (!file) return sendNotFound(res, 'Markdown file');

    deleteMarkdownFile(file);
    data.markdownFiles = data.markdownFiles.filter(item => item.id !== req.params.id);
    saveData(data);
    res.json({ success: true });
});

app.listen(PORT, () => {
    console.log(`Vibe Launcher at http://localhost:${PORT}`);
});
