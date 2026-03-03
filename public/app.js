const API_BASE = '/api/projects';

// ─── DOM ───────────────────────────────────────
const projectsGrid = document.getElementById('projectsGrid');
const addModal = document.getElementById('addModal');
const addProjectBtn = document.getElementById('addProjectBtn');
const closeModalBtn = document.getElementById('closeModalBtn');
const cancelModalBtn = document.getElementById('cancelModalBtn');
const projectForm = document.getElementById('projectForm');
const commandsList = document.getElementById('commandsList');
const addCmdBtn = document.getElementById('addCmdBtn');
const categoryList = document.getElementById('categoryList');
const searchInput = document.getElementById('searchInput');
const headerTitle = document.getElementById('headerTitle');
const headerSub = document.getElementById('headerSub');
const themeToggleBtn = document.getElementById('themeToggleBtn');
const themeIcon = document.getElementById('themeIcon');

// ─── State ─────────────────────────────────────
let projects = [];
let activeCategory = 'All';
let searchQuery = '';
let dragSrcId = null;   // current card being dragged
const runningCommands = {};  // { "projectId_cmdIndex": true }

// ═══════════════════════════════════════════════
//  THEME TOGGLE
// ═══════════════════════════════════════════════
function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('vibe-theme', theme);
    themeIcon.className = theme === 'dark' ? 'ph-bold ph-sun' : 'ph-bold ph-moon';
    themeToggleBtn.title = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
}

(function initTheme() {
    const saved = localStorage.getItem('vibe-theme') || 'dark';
    applyTheme(saved);
})();

themeToggleBtn.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme');
    applyTheme(current === 'dark' ? 'light' : 'dark');
});

// ═══════════════════════════════════════════════
//  TOAST NOTIFICATIONS
// ═══════════════════════════════════════════════
function showToast(message, type = 'info', duration = 3000) {
    const container = document.getElementById('toast-container');
    const iconMap = {
        success: 'ph-bold ph-check-circle',
        error: 'ph-bold ph-warning-circle',
        info: 'ph-bold ph-info',
    };
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<i class="${iconMap[type] || iconMap.info}"></i><span>${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => {
        toast.classList.add('fade-out');
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

// ═══════════════════════════════════════════════
//  DATA FETCHING
// ═══════════════════════════════════════════════
async function fetchProjects() {
    try {
        const res = await fetch(API_BASE);
        projects = await res.json();
        renderCategories();
        renderProjects();
    } catch (e) {
        console.error('Failed to load projects:', e);
        projectsGrid.innerHTML = `
            <div class="empty-state">
                <i class="ph-bold ph-warning-circle"></i>
                <h2>Could not load projects</h2>
                <p>Make sure the server is running, then refresh.</p>
            </div>`;
    }
}

// ═══════════════════════════════════════════════
//  RENDER CATEGORIES (sidebar)
// ═══════════════════════════════════════════════
function renderCategories() {
    const countMap = {};
    projects.forEach(p => {
        const cat = (p.category || '').trim();
        if (cat) countMap[cat] = (countMap[cat] || 0) + 1;
    });

    let html = `
        <li class="category-item ${activeCategory === 'All' ? 'active' : ''}"
            onclick="filterByCategory('All')">
            <i class="ph-bold ph-squares-four"></i>
            All Projects
            <span class="cat-count">${projects.length}</span>
        </li>`;

    let datalistHtml = '';
    Object.keys(countMap).sort().forEach(cat => {
        const safe = cat.replace(/'/g, "\\'");
        html += `
            <li class="category-item ${activeCategory === cat ? 'active' : ''}"
                onclick="filterByCategory('${safe}')">
                <i class="ph-bold ph-folder-simple"></i>
                ${escHtml(cat)}
                <span class="cat-count">${countMap[cat]}</span>
            </li>`;
        datalistHtml += `<option value="${cat}"></option>`;
    });

    categoryList.innerHTML = html;
    const dl = document.getElementById('categoryOptions');
    if (dl) dl.innerHTML = datalistHtml;
}

// ═══════════════════════════════════════════════
//  FILTER
// ═══════════════════════════════════════════════
window.filterByCategory = function (category) {
    activeCategory = category;
    renderCategories();
    renderProjects();
    headerTitle.textContent = category === 'All' ? 'All Projects' : category;
    headerSub.textContent = category === 'All'
        ? 'Your vibe-coded apps, all in one place'
        : `Projects in "${category}"`;
};

// ═══════════════════════════════════════════════
//  RENDER PROJECTS
// ═══════════════════════════════════════════════
function renderProjects() {
    let filtered = [...projects];

    if (activeCategory !== 'All') {
        filtered = filtered.filter(p => (p.category || '').trim() === activeCategory);
    }

    if (searchQuery) {
        const q = searchQuery.toLowerCase();
        filtered = filtered.filter(p =>
            p.name.toLowerCase().includes(q) ||
            (p.path || '').toLowerCase().includes(q) ||
            (p.category || '').toLowerCase().includes(q) ||
            (p.notes || '').toLowerCase().includes(q)
        );
    }

    // Pinned cards float to top
    filtered.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));

    if (filtered.length === 0) {
        projectsGrid.innerHTML = `
            <div class="empty-state">
                <i class="ph-duotone ph-rocket-launch"></i>
                <h2>${projects.length === 0 ? 'No projects yet' : 'Nothing found'}</h2>
                <p>${projects.length === 0
                ? 'Click <strong>New Project</strong> to add your first vibe-coded app.'
                : 'Try a different search or category.'}</p>
            </div>`;
        return;
    }

    projectsGrid.innerHTML = '';

    filtered.forEach((p, idx) => {
        const card = document.createElement('div');
        card.className = `project-card${p.pinned ? ' pinned' : ''}`;
        card.style.animationDelay = `${idx * 0.055}s`;
        card.setAttribute('draggable', 'true');
        card.dataset.projectId = p.id;

        // logo
        const logoHtml = p.logo
            ? `<img src="${escAttr(p.logo)}" alt="${escAttr(p.name)} logo"
                 onerror="this.parentElement.innerHTML='<i class=\\'ph-bold ph-code\\'></i>'">`
            : `<i class="ph-bold ph-code"></i>`;

        // category badge
        const catBadge = p.category
            ? `<span class="card-category-badge">
                   <i class="ph-bold ph-folder-simple"></i>${escHtml(p.category)}
               </span>`
            : '';

        // notes preview
        const notesHtml = (p.notes || '').trim()
            ? `<div class="card-notes">${escHtml(p.notes.trim())}</div>`
            : '';

        // command buttons
        let cmdButtons = '';
        (p.commands || []).forEach((c, i) => {
            const key = `${p.id}_${i}`;
            if (runningCommands[key]) {
                cmdButtons += `
                    <button class="btn cmd-btn running"
                        onclick="stopCommand('${p.id}', ${i}, '${escAttr(c.name)}')">
                        <i class="ph-fill ph-circle" style="font-size:.5rem"></i>
                        ${escHtml(c.name)}
                    </button>`;
            } else {
                cmdButtons += `
                    <button class="btn cmd-btn"
                        onclick="executeCommand('${p.id}', ${i})">
                        <i class="ph-bold ph-play"></i>
                        ${escHtml(c.name)}
                    </button>`;
            }
        });

        card.innerHTML = `
            <div class="card-drag-handle"><i class="ph-bold ph-dots-six-vertical"></i></div>

            <div class="card-actions-top">
                <button class="icon-btn pin-btn" title="${p.pinned ? 'Unpin' : 'Pin to top'}"
                    onclick="togglePin('${p.id}')">
                    <i class="ph-${p.pinned ? 'fill' : 'bold'} ph-star"
                       style="color:${p.pinned ? 'var(--star)' : ''}"></i>
                </button>
                <button class="icon-btn" title="Edit" onclick="editProject('${p.id}')">
                    <i class="ph-bold ph-pencil-simple"></i>
                </button>
                <button class="icon-btn delete-btn" title="Delete" onclick="deleteProject('${p.id}')">
                    <i class="ph-bold ph-trash"></i>
                </button>
            </div>

            <div class="card-header">
                <div class="logo-display">${logoHtml}</div>
                <div class="card-title">
                    <h3>${escHtml(p.name)}</h3>
                    <div class="card-path" title="${escAttr(p.path)}">${escHtml(p.path)}</div>
                    ${catBadge}
                </div>
            </div>

            ${notesHtml}

            <div class="actions-area">
                <button class="btn cmd-btn ide-btn" onclick="openIDE('${p.id}')">
                    <i class="ph-bold ph-terminal-window"></i>
                    ${escHtml(p.ide || 'IDE')}
                </button>
                ${cmdButtons}
            </div>`;

        projectsGrid.appendChild(card);
    });

    setupDragDrop();
}

// ═══════════════════════════════════════════════
//  DRAG & DROP
// ═══════════════════════════════════════════════
function setupDragDrop() {
    const cards = projectsGrid.querySelectorAll('.project-card');

    cards.forEach(card => {
        card.addEventListener('dragstart', (e) => {
            // Prevent drag when clicking buttons or the drag handle isn't visible
            if (e.target.closest('button')) { e.preventDefault(); return; }
            dragSrcId = card.dataset.projectId;
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', dragSrcId);
            setTimeout(() => card.classList.add('dragging'), 0);
        });

        card.addEventListener('dragend', () => {
            card.classList.remove('dragging');
            projectsGrid.querySelectorAll('.project-card')
                .forEach(c => c.classList.remove('drag-over'));
            dragSrcId = null;
        });

        card.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            if (card.dataset.projectId !== dragSrcId) {
                card.classList.add('drag-over');
            }
        });

        card.addEventListener('dragleave', (e) => {
            if (!card.contains(e.relatedTarget)) {
                card.classList.remove('drag-over');
            }
        });

        card.addEventListener('drop', (e) => {
            e.preventDefault();
            card.classList.remove('drag-over');
            const targetId = card.dataset.projectId;
            if (!dragSrcId || dragSrcId === targetId) return;

            // Reorder in the master array
            const srcIdx = projects.findIndex(p => p.id === dragSrcId);
            if (srcIdx === -1) return;
            const [moved] = projects.splice(srcIdx, 1);
            const newTgtIdx = projects.findIndex(p => p.id === targetId);
            if (newTgtIdx === -1) { projects.push(moved); }
            else { projects.splice(newTgtIdx, 0, moved); }

            renderProjects();
            persistOrder();
        });
    });
}

async function persistOrder() {
    try {
        await fetch(`${API_BASE}/reorder`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids: projects.map(p => p.id) })
        });
    } catch (e) {
        console.error('Failed to persist order:', e);
    }
}

// ═══════════════════════════════════════════════
//  PIN / FAVORITE
// ═══════════════════════════════════════════════
window.togglePin = async function (id) {
    const project = projects.find(p => p.id === id);
    if (!project) return;
    const newPinned = !project.pinned;

    try {
        const res = await fetch(`${API_BASE}/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...project, pinned: newPinned })
        });
        if (res.ok) {
            project.pinned = newPinned;
            showToast(newPinned ? 'Pinned to top.' : 'Unpinned.', 'info');
            renderProjects();
        }
    } catch (e) {
        showToast('Could not toggle pin.', 'error');
    }
};

// ═══════════════════════════════════════════════
//  ACTIONS
// ═══════════════════════════════════════════════
async function executeCommand(id, cmdIndex) {
    runningCommands[`${id}_${cmdIndex}`] = true;
    renderProjects();
    try {
        const res = await fetch(`${API_BASE}/${id}/execute`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ commandIndex: cmdIndex })
        });
        const data = await res.json();
        if (!data.success) {
            showToast(data.error || 'Execution failed.', 'error');
            runningCommands[`${id}_${cmdIndex}`] = false;
            renderProjects();
        } else {
            showToast('Command launched!', 'success');
        }
    } catch (e) {
        showToast('Failed to execute command.', 'error');
        runningCommands[`${id}_${cmdIndex}`] = false;
        renderProjects();
    }
}

async function stopCommand(id, cmdIndex, commandName) {
    try {
        const res = await fetch(`${API_BASE}/${id}/stop`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ commandIndex: cmdIndex, commandName })
        });
        const data = await res.json();
        if (data.success) {
            showToast(`Stopped "${commandName}".`, 'info');
            runningCommands[`${id}_${cmdIndex}`] = false;
            renderProjects();
        } else {
            showToast(data.error || 'Could not stop.', 'error');
        }
    } catch (e) {
        showToast('Failed to stop. It may have already exited.', 'error');
        runningCommands[`${id}_${cmdIndex}`] = false;
        renderProjects();
    }
}

async function openIDE(id) {
    try {
        const res = await fetch(`${API_BASE}/${id}/open-ide`, { method: 'POST' });
        const data = await res.json();
        if (data.success) showToast('Opened in IDE.', 'success');
        else showToast(data.error || 'Could not open IDE.', 'error');
    } catch (e) {
        showToast('Failed to open IDE.', 'error');
    }
}

async function deleteProject(id) {
    const project = projects.find(p => p.id === id);
    if (!project) return;
    if (!confirm(`Delete "${project.name}"? This cannot be undone.`)) return;
    try {
        await fetch(`${API_BASE}/${id}`, { method: 'DELETE' });
        showToast(`"${project.name}" removed.`, 'info');
        fetchProjects();
    } catch (e) {
        showToast('Failed to delete project.', 'error');
    }
}

window.editProject = function (id) {
    const project = projects.find(p => p.id === id);
    if (!project) return;

    document.getElementById('modalTitle').textContent = 'Edit Project';
    document.getElementById('editProjectId').value = project.id;
    document.getElementById('pName').value = project.name || '';
    document.getElementById('pPath').value = project.path || '';
    document.getElementById('pLogo').value = project.logo || '';
    document.getElementById('pCategory').value = project.category || '';
    document.getElementById('pIde').value = project.ide || 'code';
    document.getElementById('pNotes').value = project.notes || '';

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
};

window.deleteProject = deleteProject;

// ═══════════════════════════════════════════════
//  MODAL
// ═══════════════════════════════════════════════
function openModal() {
    document.getElementById('modalTitle').textContent = 'New Project';
    document.getElementById('editProjectId').value = '';
    projectForm.reset();
    commandsList.innerHTML = '';
    addCommandRow();
    addModal.classList.remove('hidden');
}

function closeModal() { addModal.classList.add('hidden'); }

// ═══════════════════════════════════════════════
//  COMMAND ROWS
// ═══════════════════════════════════════════════
function addCommandRow() {
    const row = document.createElement('div');
    row.className = 'cmd-row';
    row.innerHTML = `
        <input type="text" placeholder="label" class="cmd-name" required>
        <input type="text" placeholder="npm run dev" class="cmd-val" required>
        <button type="button" class="icon-btn btn-remove-cmd"
            title="Remove" style="color: var(--red);">
            <i class="ph-bold ph-minus-circle"></i>
        </button>`;
    commandsList.appendChild(row);
    row.querySelector('.btn-remove-cmd').addEventListener('click', () => row.remove());
    return row;
}

// ═══════════════════════════════════════════════
//  FORM SUBMIT
// ═══════════════════════════════════════════════
projectForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const commands = [];
    commandsList.querySelectorAll('.cmd-row').forEach(r => {
        const name = r.querySelector('.cmd-name').value.trim();
        const cmd = r.querySelector('.cmd-val').value.trim();
        if (name && cmd) commands.push({ name, cmd });
    });

    const editId = document.getElementById('editProjectId').value;
    const isEdit = !!editId;
    const existing = isEdit ? projects.find(p => p.id === editId) : null;

    const body = {
        name: document.getElementById('pName').value.trim(),
        path: document.getElementById('pPath').value.trim(),
        logo: document.getElementById('pLogo').value.trim(),
        category: document.getElementById('pCategory').value.trim(),
        ide: document.getElementById('pIde').value.trim(),
        notes: document.getElementById('pNotes').value.trim(),
        pinned: existing ? existing.pinned : false,
        commands
    };

    const url = isEdit ? `${API_BASE}/${editId}` : API_BASE;
    const method = isEdit ? 'PUT' : 'POST';

    try {
        const res = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        if (res.ok) {
            closeModal();
            showToast(isEdit ? 'Project updated!' : 'Project added!', 'success');
            fetchProjects();
        } else {
            showToast('Failed to save project.', 'error');
        }
    } catch (err) {
        showToast('Network error — could not save.', 'error');
    }
});

// ═══════════════════════════════════════════════
//  EVENT LISTENERS
// ═══════════════════════════════════════════════
searchInput.addEventListener('input', (e) => {
    searchQuery = e.target.value;
    renderProjects();
});

addProjectBtn.addEventListener('click', openModal);
closeModalBtn.addEventListener('click', closeModal);
cancelModalBtn.addEventListener('click', closeModal);
addCmdBtn.addEventListener('click', addCommandRow);
addModal.addEventListener('click', (e) => { if (e.target === addModal) closeModal(); });
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !addModal.classList.contains('hidden')) closeModal();
});

// ═══════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════
function escHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function escAttr(str) {
    return String(str).replace(/'/g, '&#39;').replace(/"/g, '&quot;');
}

// ═══════════════════════════════════════════════
//  INIT
// ═══════════════════════════════════════════════
fetchProjects();
