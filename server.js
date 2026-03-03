#!/usr/bin/env node
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

// For global install, we want to store projects in a reliable place
// like the user's home directory so it's persisted across updates
const os = require('os');
const DATA_FILE = path.join(os.homedir(), 'vibelancher_projects.json');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Helper to read data
function readData() {
    if (!fs.existsSync(DATA_FILE)) {
        return [];
    }
    const raw = fs.readFileSync(DATA_FILE);
    try {
        return JSON.parse(raw);
    } catch (e) {
        return [];
    }
}

// Helper to write data
function writeData(data) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// Get all projects
app.get('/api/projects', (req, res) => {
    res.json(readData());
});

// Reorder projects (must be before /:id routes)
app.post('/api/projects/reorder', (req, res) => {
    const { ids } = req.body;
    if (!Array.isArray(ids)) return res.status(400).json({ error: 'ids must be an array' });
    let projects = readData();
    const reordered = ids.map(id => projects.find(p => p.id === id)).filter(Boolean);
    const missing = projects.filter(p => !ids.includes(p.id));
    writeData([...reordered, ...missing]);
    res.json({ success: true });
});

// Add a new project
app.post('/api/projects', (req, res) => {
    const projects = readData();
    const newProject = {
        id: Date.now().toString(),
        name: req.body.name || 'Unnamed Project',
        path: req.body.path || '',
        logo: req.body.logo || '',
        category: req.body.category || '',
        ide: req.body.ide || 'code',
        commands: req.body.commands || [],
        notes: req.body.notes || '',
        pinned: req.body.pinned || false
    };
    projects.push(newProject);
    writeData(projects);
    res.json(newProject);
});

// Delete a project
app.delete('/api/projects/:id', (req, res) => {
    let projects = readData();
    projects = projects.filter(p => p.id !== req.params.id);
    writeData(projects);
    res.json({ success: true });
});

// Update an existing project
app.put('/api/projects/:id', (req, res) => {
    const projects = readData();
    const index = projects.findIndex(p => p.id === req.params.id);
    if (index === -1) {
        return res.status(404).json({ error: 'Project not found' });
    }

    projects[index] = {
        id: req.params.id,
        name: req.body.name || projects[index].name,
        path: req.body.path || projects[index].path,
        logo: req.body.logo !== undefined ? req.body.logo : (projects[index].logo || ''),
        ide: req.body.ide || projects[index].ide,
        category: req.body.category !== undefined ? req.body.category : (projects[index].category || ''),
        commands: req.body.commands || projects[index].commands,
        notes: req.body.notes !== undefined ? req.body.notes : (projects[index].notes || ''),
        pinned: req.body.pinned !== undefined ? req.body.pinned : (projects[index].pinned || false)
    };

    writeData(projects);
    res.json(projects[index]);
});

// Execute a project command
app.post('/api/projects/:id/execute', (req, res) => {
    const projects = readData();
    const project = projects.find(p => p.id === req.params.id);
    if (!project) {
        return res.status(404).json({ error: 'Project not found' });
    }

    const { commandIndex } = req.body;
    const cmdObj = project.commands[commandIndex];
    if (!cmdObj) {
        return res.status(400).json({ error: 'Command not found' });
    }

    // Launch in a new command prompt window on Windows
    // Inject a unique signature so we can robustly trace and kill the entire tree later
    const uniqueId = `VibeID:${project.id}-${commandIndex}`;
    const fullCmd = `start "" cmd.exe /k "echo ${uniqueId} > nul && cd /d "${project.path}" && ${cmdObj.cmd}"`;

    exec(fullCmd, (error) => {
        if (error) {
            console.error('Execution error:', error);
        }
    });

    res.json({ success: true, message: `Executed ${cmdObj.name}` });
});

// Stop a project command
app.post('/api/projects/:id/stop', (req, res) => {
    const { commandIndex, commandName } = req.body;
    const uniqueId = `VibeID:${req.params.id}-${commandIndex}`;

    // Find cmd.exe process(es) that contain our unique signature
    const psCmd = `powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"Name='cmd.exe' and CommandLine LIKE '%${uniqueId}%'\\" | Select-Object -ExpandProperty ProcessId"`;

    exec(psCmd, (err, stdout) => {
        if (err || !stdout.trim()) {
            return res.json({ success: false, error: 'Process not found or already stopped.' });
        }

        const pids = stdout.trim().split('\n').map(pid => pid.trim()).filter(pid => pid);

        if (pids.length === 0) {
            return res.json({ success: false, error: 'Process not found.' });
        }

        // Terminate process tree forcefully for each matched process
        pids.forEach(pid => {
            exec(`taskkill /PID ${pid} /T /F`, (killErr) => {
                if (killErr) {
                    console.log(`Could not kill process ${pid}`, killErr);
                }
            });
        });

        res.json({ success: true, message: `Stopped ${commandName || 'command'}` });
    });
});

// Open IDE
app.post('/api/projects/:id/open-ide', (req, res) => {
    const projects = readData();
    const project = projects.find(p => p.id === req.params.id);
    if (!project) {
        return res.status(404).json({ error: 'Project not found' });
    }

    // Launch IDE
    const fullCmd = `start "" cmd.exe /c "cd /d "${project.path}" && ${project.ide} ."`;
    exec(fullCmd, (error) => {
        if (error) {
            console.error('Execution error:', error);
            return res.status(500).json({ error: error.message });
        }
    });

    res.json({ success: true, message: `Opened with ${project.ide}` });
});

app.listen(PORT, () => {
    console.log(`Vibe Launcher API listening at http://localhost:${PORT}`);
});
