#!/usr/bin/env node
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { exec } = require('child_process');

const DATA_FILE = path.join(os.homedir(), 'vibelancher_projects.json');
const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─────────────────────────────────────────────────────────
//  DATA LAYER
//  File format: { categories: string[], projects: Project[] }
//  Migrates automatically from old format (plain array)
// ─────────────────────────────────────────────────────────
function migrateProject(p) {
    // Converts old single `category` string → `categories` array
    return {
        ...p,
        categories: Array.isArray(p.categories)
            ? p.categories
            : (p.category ? [p.category] : []),
        notes: p.notes || '',
        pinned: p.pinned || false,
    };
}

function readData() {
    if (!fs.existsSync(DATA_FILE)) return { categories: [], projects: [] };
    try {
        const raw = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
        if (Array.isArray(raw)) {
            // Old format — migrate
            const projects = raw.map(migrateProject);
            const cats = [...new Set(projects.flatMap(p => p.categories))].sort();
            return { categories: cats, projects };
        }
        return {
            categories: raw.categories || [],
            projects: (raw.projects || []).map(migrateProject),
        };
    } catch { return { categories: [], projects: [] }; }
}

function writeData(data) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// ─────────────────────────────────────────────────────────
//  CATEGORIES
// ─────────────────────────────────────────────────────────

// GET all categories (stored + derived from projects)
app.get('/api/categories', (req, res) => {
    const data = readData();
    const fromProjects = data.projects.flatMap(p => p.categories || []);
    const all = [...new Set([...data.categories, ...fromProjects])].sort();
    res.json(all);
});

// POST create a new standalone category
app.post('/api/categories', (req, res) => {
    const name = (req.body.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Name required' });
    const data = readData();
    if (!data.categories.includes(name)) {
        data.categories.push(name);
        data.categories.sort();
        writeData(data);
    }
    res.json({ success: true, name });
});

// DELETE a category (removes from stored list and from all projects)
app.delete('/api/categories/:name', (req, res) => {
    const name = decodeURIComponent(req.params.name);
    const data = readData();
    data.categories = data.categories.filter(c => c !== name);
    data.projects = data.projects.map(p => ({
        ...p,
        categories: (p.categories || []).filter(c => c !== name),
    }));
    writeData(data);
    res.json({ success: true });
});

// ─────────────────────────────────────────────────────────
//  PROJECTS
// ─────────────────────────────────────────────────────────

app.get('/api/projects', (req, res) => res.json(readData().projects));

// Reorder (must be before /:id routes)
app.post('/api/projects/reorder', (req, res) => {
    const { ids } = req.body;
    if (!Array.isArray(ids)) return res.status(400).json({ error: 'ids must be an array' });
    const data = readData();
    const ordered = ids.map(id => data.projects.find(p => p.id === id)).filter(Boolean);
    const rest = data.projects.filter(p => !ids.includes(p.id));
    data.projects = [...ordered, ...rest];
    writeData(data);
    res.json({ success: true });
});

// Create project
app.post('/api/projects', (req, res) => {
    const data = readData();
    const p = {
        id: Date.now().toString(),
        name: req.body.name || 'Unnamed Project',
        path: req.body.path || '',
        logo: req.body.logo || '',
        ide: req.body.ide || 'code',
        categories: req.body.categories || [],
        commands: req.body.commands || [],
        notes: req.body.notes || '',
        pinned: req.body.pinned || false,
    };
    data.projects.push(p);
    writeData(data);
    res.json(p);
});

// Delete project
app.delete('/api/projects/:id', (req, res) => {
    const data = readData();
    data.projects = data.projects.filter(p => p.id !== req.params.id);
    writeData(data);
    res.json({ success: true });
});

// Update project
app.put('/api/projects/:id', (req, res) => {
    const data = readData();
    const i = data.projects.findIndex(p => p.id === req.params.id);
    if (i === -1) return res.status(404).json({ error: 'Project not found' });
    const old = data.projects[i];
    data.projects[i] = {
        id: req.params.id,
        name: req.body.name || old.name,
        path: req.body.path || old.path,
        logo: req.body.logo !== undefined ? req.body.logo : old.logo,
        ide: req.body.ide || old.ide,
        categories: req.body.categories !== undefined ? req.body.categories : old.categories,
        commands: req.body.commands || old.commands,
        notes: req.body.notes !== undefined ? req.body.notes : old.notes,
        pinned: req.body.pinned !== undefined ? req.body.pinned : old.pinned,
    };
    writeData(data);
    res.json(data.projects[i]);
});

// Execute command
app.post('/api/projects/:id/execute', (req, res) => {
    const data = readData();
    const project = data.projects.find(p => p.id === req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    const cmdObj = project.commands[req.body.commandIndex];
    if (!cmdObj) return res.status(400).json({ error: 'Command not found' });
    const uid = `VibeID:${project.id}-${req.body.commandIndex}`;
    exec(`start "" cmd.exe /k "echo ${uid} > nul && cd /d "${project.path}" && ${cmdObj.cmd}"`);
    res.json({ success: true });
});

// Stop command
app.post('/api/projects/:id/stop', (req, res) => {
    const { commandIndex, commandName } = req.body;
    const uid = `VibeID:${req.params.id}-${commandIndex}`;
    const psCmd = `powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"Name='cmd.exe' and CommandLine LIKE '%${uid}%'\\" | Select-Object -ExpandProperty ProcessId"`;
    exec(psCmd, (err, stdout) => {
        if (err || !stdout.trim()) return res.json({ success: false, error: 'Process not found or already stopped.' });
        const pids = stdout.trim().split('\n').map(p => p.trim()).filter(Boolean);
        if (!pids.length) return res.json({ success: false, error: 'Process not found.' });
        pids.forEach(pid => exec(`taskkill /PID ${pid} /T /F`));
        res.json({ success: true, message: `Stopped ${commandName || 'command'}` });
    });
});

// Open IDE
app.post('/api/projects/:id/open-ide', (req, res) => {
    const data = readData();
    const project = data.projects.find(p => p.id === req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    exec(`start "" cmd.exe /c "cd /d "${project.path}" && ${project.ide} ."`, err => {
        if (err) console.error(err);
    });
    res.json({ success: true });
});

app.listen(PORT, () => console.log(`Vibe Launcher at http://localhost:${PORT}`));
