#!/usr/bin/env node
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');

const {
    normalizeProject,
    normalizeMcpServer,
    normalizePrompt,
    normalizeMarkdownFile,
    pushMcpHistory,
    readData,
    writeData,
    DATA_FILE,
} = require('./lib/data-store');
const { discoverServer, invokeTool } = require('./lib/mcp-client');
const {
    deleteMarkdownFile,
    getMarkdownRecord,
    importMarkdownFiles,
    streamMarkdownZip,
    updateMarkdownFile,
} = require('./lib/markdown-store');
const activity = require('./lib/activity-store');
const settings = require('./lib/settings-store');
const processTracker = require('./lib/process-tracker');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json({ limit: '12mb' }));
app.use((req, res, next) => {
    // Disable caching for static assets so edits show up instantly.
    res.setHeader('Cache-Control', 'no-store, must-revalidate');
    next();
});
app.use(express.static(path.join(__dirname, 'public')));

function getData() { return readData(); }
function saveData(data) { writeData(data); }
function notFound(res, label) { return res.status(404).json({ error: `${label} not found` }); }

function updateCategoriesFromProjects(data) {
    const fromProjects = data.projects.flatMap(p => p.categories || []);
    data.categories = [...new Set([...(data.categories || []), ...fromProjects])].sort((a, b) => a.localeCompare(b));
}

function summarizeResultPreview(result) {
    if (result.textOutput) return result.textOutput.slice(0, 140);
    if (result.structuredContent) return JSON.stringify(result.structuredContent).slice(0, 140);
    return result.isError ? 'Tool returned an error result.' : 'Tool executed successfully.';
}

app.get('/api/bootstrap', (req, res) => {
    const data = getData();
    res.json({
        ...data,
        settings: settings.read(),
        running: processTracker.list(),
        activity: activity.list(30),
    });
});

/* ============ Settings ============ */
app.get('/api/settings', (req, res) => res.json(settings.read()));
app.put('/api/settings', (req, res) => res.json(settings.write(req.body || {})));

/* ============ Activity ============ */
app.get('/api/activity', (req, res) => res.json(activity.list(Number(req.query.limit) || 30)));
app.delete('/api/activity', (req, res) => { activity.clear(); res.json({ success: true }); });

/* ============ Categories ============ */
app.get('/api/categories', (req, res) => res.json(getData().categories));

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
    data.categories = data.categories.filter(c => c !== name);
    data.projects = data.projects.map(p => ({ ...p, categories: (p.categories || []).filter(c => c !== name) }));
    saveData(data);
    res.json({ success: true });
});

/* ============ Projects ============ */
app.get('/api/projects', (req, res) => res.json(getData().projects));

app.post('/api/projects/reorder', (req, res) => {
    const { ids } = req.body;
    if (!Array.isArray(ids)) return res.status(400).json({ error: 'ids must be an array' });
    const data = getData();
    const ordered = ids.map(id => data.projects.find(p => p.id === id)).filter(Boolean);
    const remaining = data.projects.filter(p => !ids.includes(p.id));
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
    activity.record({ type: 'project.created', title: 'Created project', subtitle: project.name, projectId: project.id });
    res.json(project);
});

app.put('/api/projects/:id', (req, res) => {
    const data = getData();
    const index = data.projects.findIndex(p => p.id === req.params.id);
    if (index === -1) return notFound(res, 'Project');
    data.projects[index] = normalizeProject({ ...data.projects[index], ...req.body, id: req.params.id });
    updateCategoriesFromProjects(data);
    saveData(data);
    res.json(data.projects[index]);
});

app.delete('/api/projects/:id', (req, res) => {
    const data = getData();
    const project = data.projects.find(p => p.id === req.params.id);
    data.projects = data.projects.filter(p => p.id !== req.params.id);
    saveData(data);
    if (project) activity.record({ type: 'project.deleted', title: 'Deleted project', subtitle: project.name });
    res.json({ success: true });
});

app.put('/api/projects/:id/links', (req, res) => {
    const data = getData();
    const index = data.projects.findIndex(p => p.id === req.params.id);
    if (index === -1) return notFound(res, 'Project');
    const linkedPrompts = Array.isArray(req.body?.linkedPrompts) ? req.body.linkedPrompts : data.projects[index].linkedPrompts;
    const linkedMarkdown = Array.isArray(req.body?.linkedMarkdown) ? req.body.linkedMarkdown : data.projects[index].linkedMarkdown;
    data.projects[index] = normalizeProject({ ...data.projects[index], linkedPrompts, linkedMarkdown });
    saveData(data);
    res.json(data.projects[index]);
});

app.get('/api/projects/:id/health', (req, res) => {
    const data = getData();
    const project = data.projects.find(p => p.id === req.params.id);
    if (!project) return notFound(res, 'Project');
    const pathExists = project.path ? fs.existsSync(project.path) : false;
    const hasCommands = Array.isArray(project.commands) && project.commands.length > 0;
    let hasPackageJson = false;
    try { hasPackageJson = pathExists && fs.existsSync(path.join(project.path, 'package.json')); } catch {}
    res.json({
        id: project.id,
        pathExists,
        hasCommands,
        hasPackageJson,
        ide: project.ide,
        checkedAt: new Date().toISOString(),
    });
});

app.post('/api/projects/:id/execute', (req, res) => {
    const data = getData();
    const project = data.projects.find(item => item.id === req.params.id);
    if (!project) return notFound(res, 'Project');
    const command = project.commands?.[req.body.commandIndex];
    if (!command) return res.status(400).json({ error: 'Command not found' });

    const uid = processTracker.start(project.id, Number(req.body.commandIndex), command.name);
    exec(`start "" cmd.exe /k "echo ${uid} > nul && cd /d "${project.path}" && ${command.cmd}"`);

    // Update lastRunAt and runCount
    const idx = data.projects.findIndex(p => p.id === project.id);
    data.projects[idx] = normalizeProject({
        ...data.projects[idx],
        lastRunAt: new Date().toISOString(),
        runCount: (data.projects[idx].runCount || 0) + 1,
    });
    saveData(data);

    activity.record({
        type: `cmd.run.${command.name.toLowerCase().includes('build') ? 'build' : command.name.toLowerCase().includes('test') ? 'test' : 'run'}`,
        title: `Ran ${command.name}`,
        subtitle: project.name,
        projectId: project.id,
        meta: { commandIndex: req.body.commandIndex },
    });

    res.json({ success: true, uid });
});

app.post('/api/projects/:id/stop', (req, res) => {
    const { commandIndex, commandName } = req.body;
    const uid = processTracker.uidFor(req.params.id, commandIndex);
    const psCmd = `powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"Name='cmd.exe' and CommandLine LIKE '%${uid}%'\\" | Select-Object -ExpandProperty ProcessId"`;

    exec(psCmd, (error, stdout) => {
        if (error || !stdout.trim()) {
            processTracker.markStopped(uid);
            return res.json({ success: false, error: 'Process not found or already stopped.' });
        }
        const pids = stdout.trim().split('\n').map(pid => pid.trim()).filter(Boolean);
        if (!pids.length) { processTracker.markStopped(uid); return res.json({ success: false, error: 'Process not found.' }); }
        pids.forEach(pid => exec(`taskkill /PID ${pid} /T /F`));
        processTracker.markStopped(uid);
        activity.record({ type: 'cmd.stop', title: `Stopped ${commandName || 'command'}`, projectId: req.params.id });
        res.json({ success: true, message: `Stopped ${commandName || 'command'}` });
    });
});

app.post('/api/projects/:id/open-ide', (req, res) => {
    const data = getData();
    const project = data.projects.find(item => item.id === req.params.id);
    if (!project) return notFound(res, 'Project');
    const ide = project.ide || settings.read().defaultIde || 'code';
    exec(`start "" cmd.exe /c "cd /d "${project.path}" && ${ide} ."`, err => { if (err) console.error(err); });
    activity.record({ type: 'project.ide', title: `Opened ${project.name} in ${ide}`, projectId: project.id });
    res.json({ success: true });
});

app.post('/api/projects/:id/open-terminal', (req, res) => {
    const data = getData();
    const project = data.projects.find(item => item.id === req.params.id);
    if (!project) return notFound(res, 'Project');
    exec(`start "" cmd.exe /k "cd /d "${project.path}""`, err => { if (err) console.error(err); });
    res.json({ success: true });
});

app.get('/api/running', async (req, res) => {
    const list = await processTracker.refreshFromSystem();
    res.json(list);
});

/* ============ MCP ============ */
app.get('/api/mcp-servers', (req, res) => res.json(getData().mcpServers));

app.post('/api/mcp-servers', (req, res) => {
    const data = getData();
    const server = normalizeMcpServer(req.body, undefined, { touch: true });
    data.mcpServers.unshift(server);
    saveData(data);
    activity.record({ type: 'mcp.added', title: `Added MCP server`, subtitle: server.name, refId: server.id });
    res.json(server);
});

app.put('/api/mcp-servers/:id', (req, res) => {
    const data = getData();
    const index = data.mcpServers.findIndex(s => s.id === req.params.id);
    if (index === -1) return notFound(res, 'MCP server');
    data.mcpServers[index] = normalizeMcpServer(req.body, data.mcpServers[index], { touch: true });
    saveData(data);
    res.json(data.mcpServers[index]);
});

app.delete('/api/mcp-servers/:id', (req, res) => {
    const data = getData();
    data.mcpServers = data.mcpServers.filter(s => s.id !== req.params.id);
    saveData(data);
    res.json({ success: true });
});

app.post('/api/mcp-servers/:id/discover', async (req, res) => {
    const data = getData();
    const index = data.mcpServers.findIndex(s => s.id === req.params.id);
    if (index === -1) return notFound(res, 'MCP server');
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
        activity.record({ type: 'mcp.discover', title: `Discovered ${data.mcpServers[index].name}`, subtitle: `${discovery.tools.length} tools`, refId: data.mcpServers[index].id });
        res.json(data.mcpServers[index]);
    } catch (error) {
        data.mcpServers[index] = normalizeMcpServer({
            ...data.mcpServers[index],
            lastStatus: 'offline',
            lastCheckedAt: new Date().toISOString(),
            lastError: error.message || 'Failed to discover server.',
        }, data.mcpServers[index], { touch: true });
        saveData(data);
        activity.record({ type: 'mcp.error', title: `${data.mcpServers[index].name} dropped connection`, subtitle: error.message || '', refId: data.mcpServers[index].id });
        res.status(502).json({ error: error.message || 'Failed to discover server.', server: data.mcpServers[index] });
    }
});

app.post('/api/mcp-servers/:id/tools/:toolName/invoke', async (req, res) => {
    const data = getData();
    const index = data.mcpServers.findIndex(s => s.id === req.params.id);
    if (index === -1) return notFound(res, 'MCP server');
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
        activity.record({
            type: 'mcp.invoke',
            title: `Invoked ${toolName}`,
            subtitle: data.mcpServers[index].name,
            refId: data.mcpServers[index].id,
            meta: { success: historyEntry.success, toolName },
        });
        res.json({ ...invocation.result, history: data.mcpServers[index].history });
    } catch (error) {
        data.mcpServers[index] = normalizeMcpServer({
            ...data.mcpServers[index],
            lastStatus: 'offline',
            lastCheckedAt: new Date().toISOString(),
            lastError: error.message || 'Tool invocation failed.',
        }, data.mcpServers[index], { touch: true });
        saveData(data);
        res.status(502).json({ error: error.message || 'Tool invocation failed.', server: data.mcpServers[index] });
    }
});

/* ============ Prompts ============ */
app.get('/api/prompts', (req, res) => res.json(getData().prompts));

app.post('/api/prompts', (req, res) => {
    const data = getData();
    const prompt = normalizePrompt(req.body, undefined, { touch: true });
    data.prompts.unshift(prompt);
    saveData(data);
    activity.record({ type: 'prompt.created', title: 'Created prompt', subtitle: prompt.title, refId: prompt.id });
    res.json(prompt);
});

app.put('/api/prompts/:id', (req, res) => {
    const data = getData();
    const index = data.prompts.findIndex(p => p.id === req.params.id);
    if (index === -1) return notFound(res, 'Prompt');
    data.prompts[index] = normalizePrompt(req.body, data.prompts[index], { touch: true });
    saveData(data);
    res.json(data.prompts[index]);
});

app.post('/api/prompts/:id/duplicate', (req, res) => {
    const data = getData();
    const prompt = data.prompts.find(item => item.id === req.params.id);
    if (!prompt) return notFound(res, 'Prompt');
    const duplicated = normalizePrompt({ ...prompt, id: undefined, title: `${prompt.title} Copy`, favorite: false, createdAt: undefined, updatedAt: undefined }, undefined, { touch: true });
    data.prompts.unshift(duplicated);
    saveData(data);
    res.json(duplicated);
});

app.delete('/api/prompts/:id', (req, res) => {
    const data = getData();
    data.prompts = data.prompts.filter(p => p.id !== req.params.id);
    saveData(data);
    res.json({ success: true });
});

/* ============ Markdown ============ */
app.get('/api/markdown-files', (req, res) => res.json(getData().markdownFiles));

app.post('/api/markdown-files/import', (req, res) => {
    const files = Array.isArray(req.body.files) ? req.body.files : [];
    if (!files.length) return res.status(400).json({ error: 'At least one markdown file is required.' });
    const imported = importMarkdownFiles(files, {
        tags: Array.isArray(req.body.tags) ? req.body.tags : [],
        description: typeof req.body.description === 'string' ? req.body.description : '',
    });
    if (!imported.length) return res.status(400).json({ error: 'No valid markdown files were provided.' });
    const data = getData();
    data.markdownFiles.unshift(...imported.map(f => normalizeMarkdownFile(f, undefined, { touch: false })));
    saveData(data);
    imported.forEach(f => activity.record({ type: 'md.imported', title: `Imported ${f.filename}`, subtitle: `${(f.size/1024).toFixed(1)} KB`, refId: f.id }));
    res.json(imported);
});

app.post('/api/markdown-files/batch', (req, res) => {
    const ids = Array.isArray(req.body.ids) ? req.body.ids : [];
    if (!ids.length) return res.status(400).json({ error: 'ids must be a non-empty array' });
    const files = getData().markdownFiles.filter(f => ids.includes(f.id)).map(getMarkdownRecord);
    res.json(files);
});

app.post('/api/markdown-files/export', (req, res) => {
    const ids = Array.isArray(req.body.ids) ? req.body.ids : [];
    if (!ids.length) return res.status(400).json({ error: 'ids must be a non-empty array' });
    const files = getData().markdownFiles.filter(f => ids.includes(f.id));
    if (!files.length) return res.status(404).json({ error: 'No markdown files found for export.' });
    streamMarkdownZip(files, res);
});

app.get('/api/markdown-files/:id', (req, res) => {
    const file = getData().markdownFiles.find(f => f.id === req.params.id);
    if (!file) return notFound(res, 'Markdown file');
    res.json(getMarkdownRecord(file));
});

app.put('/api/markdown-files/:id', (req, res) => {
    const data = getData();
    const index = data.markdownFiles.findIndex(f => f.id === req.params.id);
    if (index === -1) return notFound(res, 'Markdown file');
    const updated = updateMarkdownFile(data.markdownFiles[index], req.body);
    data.markdownFiles[index] = normalizeMarkdownFile(updated, data.markdownFiles[index], { touch: false });
    saveData(data);
    res.json(data.markdownFiles[index]);
});

app.delete('/api/markdown-files/:id', (req, res) => {
    const data = getData();
    const file = data.markdownFiles.find(f => f.id === req.params.id);
    if (!file) return notFound(res, 'Markdown file');
    deleteMarkdownFile(file);
    data.markdownFiles = data.markdownFiles.filter(f => f.id !== req.params.id);
    saveData(data);
    res.json({ success: true });
});

/* ============ Backup & Search ============ */
app.get('/api/backup', (req, res) => {
    const data = getData();
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="vibe-launcher-backup-${Date.now()}.json"`);
    res.send(JSON.stringify(data, null, 2));
});

app.post('/api/backup', (req, res) => {
    try {
        if (!req.body || typeof req.body !== 'object') return res.status(400).json({ error: 'Invalid backup payload' });
        fs.writeFileSync(DATA_FILE, JSON.stringify(req.body, null, 2));
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message || 'Restore failed' });
    }
});

app.get('/api/search', (req, res) => {
    const q = String(req.query.q || '').trim().toLowerCase();
    if (!q) return res.json({ projects: [], prompts: [], markdown: [], tools: [] });
    const data = getData();
    const match = (s) => typeof s === 'string' && s.toLowerCase().includes(q);
    const projects = data.projects.filter(p => match(p.name) || match(p.path) || match(p.notes) || (p.categories || []).some(match)).slice(0, 12);
    const prompts = data.prompts.filter(p => match(p.title) || match(p.description) || match(p.template) || (p.tags || []).some(match)).slice(0, 12);
    const markdown = data.markdownFiles.filter(f => match(f.title) || match(f.filename) || match(f.excerpt) || (f.tags || []).some(match)).slice(0, 12);
    const tools = data.mcpServers.flatMap(srv => (srv.tools || []).filter(t => match(t.name) || match(t.description)).map(t => ({ ...t, serverId: srv.id, serverName: srv.name }))).slice(0, 12);
    res.json({ projects, prompts, markdown, tools });
});

app.listen(PORT, () => {
    console.log(`Vibe Launcher at http://localhost:${PORT}`);
});
