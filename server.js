const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const app = express();
const PORT = 3000;
const DATA_FILE = path.join(__dirname, 'projects.json');

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

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

// Add a new project
app.post('/api/projects', (req, res) => {
    const projects = readData();
    const newProject = {
        id: Date.now().toString(),
        name: req.body.name || 'Unnamed Project',
        path: req.body.path || '',
        logo: req.body.logo || '',
        ide: req.body.ide || 'code',
        commands: req.body.commands || []
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
        id: req.params.id, // Preserve ID
        name: req.body.name || projects[index].name,
        path: req.body.path || projects[index].path,
        logo: req.body.logo || projects[index].logo,
        ide: req.body.ide || projects[index].ide,
        commands: req.body.commands || projects[index].commands
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
    // /k keeps the window open
    const fullCmd = `start "" cmd.exe /k "cd /d "${project.path}" && ${cmdObj.cmd}"`;
    exec(fullCmd, (error) => {
        if (error) {
            console.error('Execution error:', error);
            return res.status(500).json({ error: error.message });
        }
    });
    res.json({ success: true, message: `Executed ${cmdObj.name}` });
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
