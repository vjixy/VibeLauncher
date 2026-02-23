const API_BASE = '/api/projects';

// DOM Elements
const projectsGrid = document.getElementById('projectsGrid');
const addModal = document.getElementById('addModal');
const addProjectBtn = document.getElementById('addProjectBtn');
const closeModalBtn = document.getElementById('closeModalBtn');
const cancelModalBtn = document.getElementById('cancelModalBtn');
const projectForm = document.getElementById('projectForm');
const commandsList = document.getElementById('commandsList');
const addCmdBtn = document.getElementById('addCmdBtn');
const categoryList = document.getElementById('categoryList');

// State
let projects = [];
let activeCategory = 'All';

// Search Input
const searchInput = document.getElementById('searchInput');
let searchQuery = '';

// Fetch and Render Projects
async function fetchProjects() {
    try {
        const res = await fetch(API_BASE);
        projects = await res.json();
        renderCategories();
        renderProjects();
    } catch (e) {
        console.error('Failed to load projects:', e);
        projectsGrid.innerHTML = '<div class="loading">Error loading projects.</div>';
    }
}

function renderCategories() {
    const categories = new Set();
    projects.forEach(p => {
        if (p.category && p.category.trim() !== '') {
            categories.add(p.category.trim());
        }
    });

    const sortedCategories = Array.from(categories).sort();

    let html = `
        <li class="category-item ${activeCategory === 'All' ? 'active' : ''}" onclick="filterByCategory('All')">
            <i class="ph-bold ph-squares-four"></i> All Projects
        </li>
    `;
    let datalistHtml = '';

    sortedCategories.forEach(cat => {
        const safeCat = cat.replace(/'/g, "\\'");
        html += `
            <li class="category-item ${activeCategory === cat ? 'active' : ''}" onclick="filterByCategory('${safeCat}')">
                <i class="ph-bold ph-folder"></i> ${cat}
            </li>
        `;
        datalistHtml += `<option value="${cat}"></option>`;
    });

    categoryList.innerHTML = html;

    // Update datalist for autocompletion
    const dataListElement = document.getElementById('categoryOptions');
    if (dataListElement) {
        dataListElement.innerHTML = datalistHtml;
    }
}

window.filterByCategory = function (category) {
    activeCategory = category;
    renderCategories();
    renderProjects();
}

function renderProjects() {
    let filteredProjects = projects;

    if (activeCategory !== 'All') {
        filteredProjects = filteredProjects.filter(p => p.category === activeCategory);
    }

    if (searchQuery) {
        const q = searchQuery.toLowerCase();
        filteredProjects = projects.filter(p =>
            p.name.toLowerCase().includes(q) ||
            p.path.toLowerCase().includes(q)
        );
    }

    if (filteredProjects.length === 0) {
        projectsGrid.innerHTML = `
            <div class="empty-state" style="grid-column: 1/-1; text-align: center; padding: 4rem; color: var(--text-muted);">
                <i class="ph-duotone ph-rocket" style="font-size: 4rem; margin-bottom: 1rem; color: var(--primary);"></i>
                <h2>No Vibe Projects Found</h2>
                <p>${projects.length === 0 ? 'Click "New Project" to start tracking your magical creations.' : 'Try adjusting your search query.'}</p>
            </div>
        `;
        return;
    }

    projectsGrid.innerHTML = '';
    filteredProjects.forEach((p, index) => {
        const card = document.createElement('div');
        card.className = 'project-card';
        card.style.animationDelay = `${index * 0.1}s`;

        const logoHtml = p.logo
            ? `<img src="${p.logo}" alt="${p.name} logo">`
            : `<i class="ph-bold ph-code"></i>`;

        let cmdButtons = '';
        if (p.commands && p.commands.length > 0) {
            p.commands.forEach((c, i) => {
                cmdButtons += `
                    <button class="btn cmd-btn" onclick="executeCommand('${p.id}', ${i})">
                        <i class="ph-bold ph-play"></i> ${c.name}
                    </button>
                `;
            });
        }

        // Action grouping string
        const actionHtml = `
            <div class="actions-area">
                <button class="btn cmd-btn ide-btn" onclick="openIDE('${p.id}')">
                    <i class="ph-bold ph-terminal-window"></i> Open in ${p.ide || 'IDE'}
                </button>
                ${cmdButtons}
            </div>
        `;

        card.innerHTML = `
            <div class="card-actions-top">
                <button class="icon-btn edit-btn" onclick="editProject('${p.id}')">
                    <i class="ph-bold ph-pencil-simple"></i>
                </button>
                <button class="icon-btn delete-btn" onclick="deleteProject('${p.id}')">
                    <i class="ph-bold ph-trash"></i>
                </button>
            </div>
            <div class="card-header">
                <div class="logo-display">${logoHtml}</div>
                <div class="card-title">
                    <h3>${p.name}</h3>
                    <p>${p.path}</p>
                </div>
            </div>
            ${actionHtml}
        `;
        projectsGrid.appendChild(card);
    });
}

// Actions
async function executeCommand(id, cmdIndex) {
    try {
        const res = await fetch(`${API_BASE}/${id}/execute`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ commandIndex: cmdIndex })
        });
        const data = await res.json();
        if (!data.success) alert(data.error);
    } catch (e) {
        console.error(e);
        alert("Failed to execute code.");
    }
}

async function openIDE(id) {
    try {
        const res = await fetch(`${API_BASE}/${id}/open-ide`, {
            method: 'POST'
        });
        const data = await res.json();
        if (!data.success) alert(data.error);
    } catch (e) {
        console.error(e);
        alert("Failed to open IDE.");
    }
}

async function deleteProject(id) {
    if (!confirm('Are you sure you want to delete this project?')) return;
    try {
        await fetch(`${API_BASE}/${id}`, { method: 'DELETE' });
        fetchProjects();
    } catch (e) {
        console.error(e);
    }
}

function editProject(id) {
    const project = projects.find(p => p.id === id);
    if (!project) return;

    document.getElementById('modalTitle').textContent = 'Edit Project';
    document.getElementById('editProjectId').value = project.id;
    document.getElementById('pName').value = project.name || '';
    document.getElementById('pPath').value = project.path || '';
    document.getElementById('pLogo').value = project.logo || '';
    document.getElementById('pCategory').value = project.category || '';
    document.getElementById('pIde').value = project.ide || 'code';

    commandsList.innerHTML = '';
    if (project.commands && project.commands.length > 0) {
        project.commands.forEach(cmd => {
            const row = addCommandRow();
            row.querySelector('.cmd-name').value = cmd.name;
            row.querySelector('.cmd-val').value = cmd.cmd;
        });
    } else {
        addCommandRow();
    }

    addModal.classList.remove('hidden');
}

// Modal Managemenet
function openModal() {
    document.getElementById('modalTitle').textContent = 'Add New Project';
    document.getElementById('editProjectId').value = '';
    addModal.classList.remove('hidden');
    // Reset Form
    projectForm.reset();
    commandsList.innerHTML = '';
    addCommandRow(); // Add one default blank row
}

function closeModal() {
    addModal.classList.add('hidden');
}

// Dynamic Command Rows
function addCommandRow() {
    const row = document.createElement('div');
    row.className = 'cmd-row';
    row.innerHTML = `
        <input type="text" placeholder="Name (e.g. backend)" class="cmd-name" required>
        <input type="text" placeholder="Command (e.g. npm run dev)" class="cmd-val" required>
        <button type="button" class="icon-btn btn-remove-cmd" style="color: #ef4444;"><i class="ph-bold ph-minus-circle"></i></button>
    `;
    commandsList.appendChild(row);

    row.querySelector('.btn-remove-cmd').addEventListener('click', () => {
        row.remove();
    });
    return row;
}

// Event Listeners
searchInput.addEventListener('input', (e) => {
    searchQuery = e.target.value;
    renderProjects();
});
addProjectBtn.addEventListener('click', openModal);
closeModalBtn.addEventListener('click', closeModal);
cancelModalBtn.addEventListener('click', closeModal);
addCmdBtn.addEventListener('click', addCommandRow);

addModal.addEventListener('click', (e) => {
    if (e.target === addModal) closeModal();
});

projectForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    // gather commands
    const commands = [];
    const rows = commandsList.querySelectorAll('.cmd-row');
    rows.forEach(r => {
        const name = r.querySelector('.cmd-name').value;
        const cmd = r.querySelector('.cmd-val').value;
        if (name && cmd) {
            commands.push({ name, cmd });
        }
    });

    const body = {
        name: document.getElementById('pName').value,
        path: document.getElementById('pPath').value,
        logo: document.getElementById('pLogo').value,
        category: document.getElementById('pCategory').value,
        ide: document.getElementById('pIde').value,
        commands
    };

    const editId = document.getElementById('editProjectId').value;
    const isEdit = !!editId;
    const url = isEdit ? `${API_BASE}/${editId}` : API_BASE;
    const method = isEdit ? 'PUT' : 'POST';

    try {
        const res = await fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        if (res.ok) {
            closeModal();
            fetchProjects();
        } else {
            alert("Failed to save project.");
        }
    } catch (err) {
        console.error(err);
    }
});

// Init
fetchProjects();
