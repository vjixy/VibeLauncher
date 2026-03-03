const API_BASE = '/api/projects';
const CAT_BASE = '/api/categories';

// ─── DOM ────────────────────────────────────────────────
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
const themeToggleBtn = document.getElementById('themeToggleBtn');
const themeIcon = document.getElementById('themeIcon');

// ─── State ──────────────────────────────────────────────
let projects = [];
let categories = [];   // global list of all categories
let activeCategory = 'All';
let searchQuery = '';
let dragSrcId = null;
const runningCommands = {};

// ═══════════════════════════════════════════════════════
//  AVATAR HELPERS
// ═══════════════════════════════════════════════════════
const AV = [
    { bg: 'rgba(91,95,239,0.15)', fg: '#818cf8' },
    { bg: 'rgba(139,92,246,0.15)', fg: '#a78bfa' },
    { bg: 'rgba(236,72,153,0.15)', fg: '#f472b6' },
    { bg: 'rgba(245,158,11,0.15)', fg: '#fbbf24' },
    { bg: 'rgba(34,197,94,0.15)', fg: '#4ade80' },
    { bg: 'rgba(59,130,246,0.15)', fg: '#60a5fa' },
    { bg: 'rgba(239,68,68,0.15)', fg: '#f87171' },
    { bg: 'rgba(6,182,212,0.15)', fg: '#22d3ee' },
    { bg: 'rgba(249,115,22,0.15)', fg: '#fb923c' },
    { bg: 'rgba(20,184,166,0.15)', fg: '#2dd4bf' },
];
const CAT_COLORS = ['#818cf8', '#a78bfa', '#f472b6', '#fbbf24', '#4ade80', '#60a5fa', '#f87171', '#22d3ee', '#fb923c', '#2dd4bf'];

function hashStr(s) { let h = 0; for (let i = 0; i < s.length; i++) h = s.charCodeAt(i) + ((h << 5) - h); return Math.abs(h); }
function getAV(name) { return AV[hashStr(name) % AV.length]; }
function getCatColor(c) { return CAT_COLORS[hashStr(c) % CAT_COLORS.length]; }
function getInitials(n) {
    const w = n.trim().split(/\s+/);
    return w.length >= 2 ? (w[0][0] + w[1][0]).toUpperCase() : n.slice(0, 2).toUpperCase() || '?';
}

// ═══════════════════════════════════════════════════════
//  THEME
// ═══════════════════════════════════════════════════════
function applyTheme(t) {
    document.documentElement.setAttribute('data-theme', t);
    localStorage.setItem('vibe-theme', t);
    themeIcon.className = t === 'dark' ? 'ph-bold ph-sun' : 'ph-bold ph-moon';
}
applyTheme(localStorage.getItem('vibe-theme') || 'dark');
themeToggleBtn.addEventListener('click', () =>
    applyTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'));

// ═══════════════════════════════════════════════════════
//  TOAST
// ═══════════════════════════════════════════════════════
function showToast(msg, type = 'info', ms = 3000) {
    const c = document.getElementById('toast-container');
    const icons = { success: 'ph-bold ph-check-circle', error: 'ph-bold ph-warning-circle', info: 'ph-bold ph-info' };
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.innerHTML = `<i class="${icons[type]}"></i><span>${msg}</span>`;
    c.appendChild(el);
    setTimeout(() => { el.classList.add('fade-out'); setTimeout(() => el.remove(), 300); }, ms);
}

// ═══════════════════════════════════════════════════════
//  FETCH
// ═══════════════════════════════════════════════════════
async function fetchAll() {
    try {
        [categories, projects] = await Promise.all([
            fetch(CAT_BASE).then(r => r.json()),
            fetch(API_BASE).then(r => r.json()),
        ]);
        // Merge any categories found in projects that aren't in the stored list
        projects.forEach(p => {
            (p.categories || []).forEach(c => { if (!categories.includes(c)) categories.push(c); });
        });
        categories.sort();
        msSetCategories(categories);
        renderCategorySidebar();
        renderProjects();
    } catch (e) {
        console.error(e);
        projectsGrid.innerHTML = `<div class="empty-state">
            <i class="ph-bold ph-warning-circle"></i>
            <h2>Could not connect</h2><p>Make sure the server is running.</p></div>`;
    }
}

// ═══════════════════════════════════════════════════════
//  SIDEBAR — CATEGORIES
// ═══════════════════════════════════════════════════════
function renderCategorySidebar() {
    const counts = {};
    projects.forEach(p => {
        (p.categories || []).forEach(c => { counts[c] = (counts[c] || 0) + 1; });
    });

    let html = `<li class="category-item ${activeCategory === 'All' ? 'active' : ''}" onclick="filterByCategory('All')">
        <i class="ph-bold ph-squares-four"></i> All Projects
        <span class="cat-count">${projects.length}</span></li>`;

    // All unique categories = stored + derived
    const allCats = [...new Set([...categories, ...Object.keys(counts)])].sort();
    allCats.forEach(cat => {
        const s = cat.replace(/'/g, "\\'");
        html += `<li class="category-item ${activeCategory === cat ? 'active' : ''}" onclick="filterByCategory('${s}')">
            <i class="ph-bold ph-folder-simple"></i>
            <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(cat)}</span>
            <span class="cat-count">${counts[cat] || 0}</span>
            <button class="cat-delete" title="Delete category" onclick="deleteCategory(event,'${s}')">
                <i class="ph-bold ph-x"></i>
            </button>
        </li>`;
    });
    categoryList.innerHTML = html;

    // Sync datalist for autocomplete elsewhere
    const dl = document.getElementById('categoryOptions');
    if (dl) dl.innerHTML = allCats.map(c => `<option value="${c}"></option>`).join('');
}

// ─── Add new category from sidebar ─────────────────────
document.getElementById('sidebarAddCatBtn').addEventListener('click', () => {
    const wrap = document.getElementById('newCatInput');
    const inp = document.getElementById('newCatField');
    wrap.classList.remove('hidden');
    inp.value = '';
    inp.focus();
});

document.getElementById('newCatField').addEventListener('keydown', async e => {
    if (e.key === 'Enter') {
        const n = e.target.value.trim();
        if (n) await doCreateCategory(n);
        document.getElementById('newCatInput').classList.add('hidden');
        e.target.value = '';
    }
    if (e.key === 'Escape') {
        document.getElementById('newCatInput').classList.add('hidden');
        e.target.value = '';
    }
});

async function doCreateCategory(name) {
    try {
        await fetch(CAT_BASE, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
        if (!categories.includes(name)) { categories.push(name); categories.sort(); }
        msSetCategories(categories);
        renderCategorySidebar();
        showToast(`Category "${name}" created.`, 'success');
    } catch { showToast('Could not create category.', 'error'); }
}

window.deleteCategory = async (e, name) => {
    e.stopPropagation();
    if (!confirm(`Delete category "${name}"? It will be removed from all projects.`)) return;
    try {
        await fetch(`${CAT_BASE}/${encodeURIComponent(name)}`, { method: 'DELETE' });
        categories = categories.filter(c => c !== name);
        projects = projects.map(p => ({ ...p, categories: (p.categories || []).filter(c => c !== name) }));
        if (activeCategory === name) activeCategory = 'All';
        msSetCategories(categories);
        renderCategorySidebar();
        renderProjects();
        showToast(`"${name}" deleted.`, 'info');
    } catch { showToast('Could not delete category.', 'error'); }
};

// ─── Filter ────────────────────────────────────────────
window.filterByCategory = function (cat) {
    activeCategory = cat;
    renderCategorySidebar();
    renderProjects();
    headerTitle.textContent = cat === 'All' ? 'All Projects' : cat;
};

// ═══════════════════════════════════════════════════════
//  MULTI-SELECT CATEGORY COMPONENT
// ═══════════════════════════════════════════════════════
let msSelected = new Set();
let msAllCats = [];

const msInput = document.getElementById('msInput');
const msTags = document.getElementById('msTags');
const msDropdown = document.getElementById('msDropdown');
const msOptionList = document.getElementById('msOptionList');
const msEmpty = document.getElementById('msEmpty');
const msCreate = document.getElementById('msCreate');
const msCreateLbl = document.getElementById('msCreateLabel');
const msWrapper = document.getElementById('pCategorySelect');

function msSetCategories(cats) { msAllCats = [...cats]; }

function msOpen() {
    msInput.value = '';
    msDropdown.classList.remove('hidden');
    msRenderOptions('');
}
function msClose() {
    msDropdown.classList.add('hidden');
    msInput.value = '';
}

function msRenderOptions(q) {
    const filtered = msAllCats.filter(c => c.toLowerCase().includes(q.toLowerCase()));
    msOptionList.innerHTML = '';
    filtered.forEach(cat => {
        const sel = msSelected.has(cat);
        const div = document.createElement('div');
        div.className = `ms-option${sel ? ' is-selected' : ''}`;
        div.innerHTML = `<span class="ms-check">${sel ? '<i class="ph-bold ph-check"></i>' : ''}</span>${escHtml(cat)}`;
        div.addEventListener('click', () => { msToggle(cat); msRenderOptions(msInput.value); });
        msOptionList.appendChild(div);
    });
    const noMatch = filtered.length === 0;
    msEmpty.classList.toggle('hidden', !noMatch || !q);
    const exact = msAllCats.some(c => c.toLowerCase() === q.toLowerCase());
    msCreate.classList.toggle('hidden', !q || exact);
    if (q && !exact) msCreateLbl.textContent = q;
}

function msToggle(cat) {
    if (msSelected.has(cat)) msSelected.delete(cat); else msSelected.add(cat);
    msRenderTags();
}

function msRenderTags() {
    msTags.innerHTML = '';
    msSelected.forEach(cat => {
        const span = document.createElement('span');
        span.className = 'ms-tag';
        span.innerHTML = `${escHtml(cat)}<button type="button" data-c="${escAttr(cat)}"><i class="ph-bold ph-x"></i></button>`;
        span.querySelector('button').addEventListener('click', e => {
            e.stopPropagation();
            msSelected.delete(cat);
            msRenderTags();
            msRenderOptions(msInput.value);
        });
        msTags.appendChild(span);
    });
}

function msReset() { msSelected = new Set(); msRenderTags(); msClose(); }
function msGetValue() { return [...msSelected]; }
function msSetValue(arr) { msSelected = new Set(arr || []); msRenderTags(); }

// Multi-select events
msInput.addEventListener('focus', msOpen);
msInput.addEventListener('input', () => msRenderOptions(msInput.value.trim()));

msCreate.addEventListener('click', async () => {
    const name = msInput.value.trim(); if (!name) return;
    await doCreateCategory(name);
    msToggle(name);
    msRenderOptions('');
    msInput.value = '';
});

document.addEventListener('click', e => {
    if (!msWrapper.contains(e.target)) msClose();
});

msInput.addEventListener('keydown', e => {
    if (e.key === 'Escape') msClose();
    if (e.key === 'Enter') {
        e.preventDefault();
        const q = msInput.value.trim();
        if (!q) return;
        const exact = msAllCats.find(c => c.toLowerCase() === q.toLowerCase());
        if (exact) { msToggle(exact); msInput.value = ''; msRenderOptions(''); }
        else msCreate.click();
    }
});

// ═══════════════════════════════════════════════════════
//  RENDER CARDS
// ═══════════════════════════════════════════════════════
function renderProjects() {
    let list = [...projects];
    if (activeCategory !== 'All') list = list.filter(p => (p.categories || []).includes(activeCategory));
    if (searchQuery) {
        const q = searchQuery.toLowerCase();
        list = list.filter(p =>
            p.name.toLowerCase().includes(q) ||
            (p.path || '').toLowerCase().includes(q) ||
            (p.categories || []).some(c => c.toLowerCase().includes(q)) ||
            (p.notes || '').toLowerCase().includes(q)
        );
    }
    list.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));

    if (!list.length) {
        projectsGrid.innerHTML = `<div class="empty-state">
            <i class="ph-duotone ph-rocket-launch"></i>
            <h2>${projects.length === 0 ? 'No projects yet' : 'Nothing found'}</h2>
            <p>${projects.length === 0
                ? 'Click <strong>New Project</strong> to add your first app.'
                : 'Try a different search or category.'}</p></div>`;
        return;
    }

    projectsGrid.innerHTML = '';
    list.forEach((p, idx) => {
        const card = document.createElement('div');
        card.className = `project-card${p.pinned ? ' pinned' : ''}`;
        card.style.animationDelay = `${idx * 0.05}s`;
        card.setAttribute('draggable', 'true');
        card.dataset.projectId = p.id;

        // Avatar
        const av = getAV(p.name);
        const inits = getInitials(p.name);
        const avHtml = p.logo
            ? `<div class="project-avatar"><img src="${escAttr(p.logo)}" alt=""
                onerror="this.parentElement.style.cssText='--av-bg:${av.bg};--av-fg:${av.fg}';this.parentElement.textContent='${inits}'"></div>`
            : `<div class="project-avatar" style="--av-bg:${av.bg};--av-fg:${av.fg}">${inits}</div>`;

        // Category dots
        const cats = p.categories || [];
        const catsHtml = cats.length
            ? `<div class="card-cats">${cats.map(c => `<span class="project-cat">
                <span class="cat-dot" style="background:${getCatColor(c)}"></span>${escHtml(c)}
              </span>`).join('')}</div>`
            : '';

        // Notes
        const notesHtml = (p.notes || '').trim()
            ? `<div class="card-notes">${escHtml(p.notes.trim())}</div>` : '';

        // Commands
        let cmds = '';
        (p.commands || []).forEach((c, i) => {
            const key = `${p.id}_${i}`;
            cmds += runningCommands[key]
                ? `<button class="btn cmd-btn running" onclick="stopCommand('${p.id}',${i},'${escAttr(c.name)}')">
                     <i class="ph-fill ph-circle" style="font-size:6px"></i>${escHtml(c.name)}</button>`
                : `<button class="btn cmd-btn" onclick="executeCommand('${p.id}',${i})">
                     <i class="ph-bold ph-play"></i>${escHtml(c.name)}</button>`;
        });

        card.innerHTML = `
            <div class="card-drag-handle"><i class="ph-bold ph-dots-six-vertical"></i></div>
            <div class="card-actions-top">
                <button class="icon-btn pin-btn" title="${p.pinned ? 'Unpin' : 'Pin'}" onclick="togglePin('${p.id}')">
                    <i class="ph-${p.pinned ? 'fill' : 'bold'} ph-star" style="${p.pinned ? 'color:var(--star)' : ''}"></i>
                </button>
                <button class="icon-btn" title="Edit" onclick="editProject('${p.id}')">
                    <i class="ph-bold ph-pencil-simple"></i>
                </button>
                <button class="icon-btn delete-btn" title="Delete" onclick="deleteProject('${p.id}')">
                    <i class="ph-bold ph-trash"></i>
                </button>
            </div>
            <div class="card-header">
                ${avHtml}
                <div class="card-title">
                    <h3>${escHtml(p.name)}</h3>
                    <div class="card-path" title="${escAttr(p.path)}">${escHtml(p.path)}</div>
                    ${catsHtml}
                </div>
            </div>
            ${notesHtml}
            <div class="actions-area">
                <button class="btn cmd-btn ide-btn" onclick="openIDE('${p.id}')">
                    <i class="ph-bold ph-terminal-window"></i>${escHtml(p.ide || 'IDE')}
                </button>
                ${cmds}
            </div>`;
        projectsGrid.appendChild(card);
    });
    setupDragDrop();
}

// ═══════════════════════════════════════════════════════
//  DRAG & DROP
// ═══════════════════════════════════════════════════════
function setupDragDrop() {
    projectsGrid.querySelectorAll('.project-card').forEach(card => {
        card.addEventListener('dragstart', e => {
            if (e.target.closest('button')) { e.preventDefault(); return; }
            dragSrcId = card.dataset.projectId;
            e.dataTransfer.effectAllowed = 'move';
            setTimeout(() => card.classList.add('dragging'), 0);
        });
        card.addEventListener('dragend', () => {
            card.classList.remove('dragging');
            projectsGrid.querySelectorAll('.project-card').forEach(c => c.classList.remove('drag-over'));
            dragSrcId = null;
        });
        card.addEventListener('dragover', e => {
            e.preventDefault(); e.dataTransfer.dropEffect = 'move';
            if (card.dataset.projectId !== dragSrcId) card.classList.add('drag-over');
        });
        card.addEventListener('dragleave', e => {
            if (!card.contains(e.relatedTarget)) card.classList.remove('drag-over');
        });
        card.addEventListener('drop', e => {
            e.preventDefault(); card.classList.remove('drag-over');
            const tgt = card.dataset.projectId;
            if (!dragSrcId || dragSrcId === tgt) return;
            const si = projects.findIndex(p => p.id === dragSrcId);
            if (si === -1) return;
            const [moved] = projects.splice(si, 1);
            const ti = projects.findIndex(p => p.id === tgt);
            projects.splice(ti === -1 ? projects.length : ti, 0, moved);
            renderProjects();
            fetch(`${API_BASE}/reorder`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ids: projects.map(p => p.id) })
            }).catch(console.error);
        });
    });
}

// ═══════════════════════════════════════════════════════
//  ACTIONS
// ═══════════════════════════════════════════════════════
window.togglePin = async function (id) {
    const p = projects.find(x => x.id === id); if (!p) return;
    const next = !p.pinned;
    try {
        const r = await fetch(`${API_BASE}/${id}`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...p, pinned: next })
        });
        if (r.ok) { p.pinned = next; showToast(next ? 'Pinned.' : 'Unpinned.', 'info'); renderProjects(); }
    } catch { showToast('Could not toggle pin.', 'error'); }
};

async function executeCommand(id, idx) {
    runningCommands[`${id}_${idx}`] = true; renderProjects();
    try {
        const r = await fetch(`${API_BASE}/${id}/execute`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ commandIndex: idx })
        });
        const d = await r.json();
        if (!d.success) { showToast(d.error || 'Execution failed.', 'error'); runningCommands[`${id}_${idx}`] = false; renderProjects(); }
        else showToast('Launched!', 'success');
    } catch { showToast('Failed to launch.', 'error'); runningCommands[`${id}_${idx}`] = false; renderProjects(); }
}

async function stopCommand(id, idx, name) {
    try {
        const r = await fetch(`${API_BASE}/${id}/stop`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ commandIndex: idx, commandName: name })
        });
        const d = await r.json();
        if (d.success) { showToast(`Stopped "${name}".`, 'info'); runningCommands[`${id}_${idx}`] = false; renderProjects(); }
        else showToast(d.error || 'Could not stop.', 'error');
    } catch { showToast('Stop failed.', 'error'); runningCommands[`${id}_${idx}`] = false; renderProjects(); }
}

async function openIDE(id) {
    try {
        const d = await (await fetch(`${API_BASE}/${id}/open-ide`, { method: 'POST' })).json();
        if (d.success) showToast('Opened in IDE.', 'success');
        else showToast(d.error || 'Could not open IDE.', 'error');
    } catch { showToast('Failed to open IDE.', 'error'); }
}

window.deleteProject = async function (id) {
    const p = projects.find(x => x.id === id); if (!p) return;
    if (!confirm(`Delete "${p.name}"? This cannot be undone.`)) return;
    try {
        await fetch(`${API_BASE}/${id}`, { method: 'DELETE' });
        showToast(`"${p.name}" removed.`, 'info'); fetchAll();
    } catch { showToast('Delete failed.', 'error'); }
};

window.editProject = function (id) {
    const p = projects.find(x => x.id === id); if (!p) return;
    document.getElementById('modalTitle').textContent = 'Edit Project';
    document.getElementById('editProjectId').value = p.id;
    document.getElementById('pName').value = p.name || '';
    document.getElementById('pPath').value = p.path || '';
    document.getElementById('pLogo').value = p.logo || '';
    document.getElementById('pIde').value = p.ide || 'code';
    document.getElementById('pNotes').value = p.notes || '';
    msSetValue(p.categories || []);
    commandsList.innerHTML = '';
    if (p.commands?.length) p.commands.forEach(c => {
        const r = addCommandRow(); r.querySelector('.cmd-name').value = c.name; r.querySelector('.cmd-val').value = c.cmd;
    }); else addCommandRow();
    addModal.classList.remove('hidden');
};

// ═══════════════════════════════════════════════════════
//  MODAL
// ═══════════════════════════════════════════════════════
function openModal() {
    document.getElementById('modalTitle').textContent = 'New Project';
    document.getElementById('editProjectId').value = '';
    projectForm.reset(); msReset();
    commandsList.innerHTML = ''; addCommandRow();
    addModal.classList.remove('hidden');
}
function closeModal() { addModal.classList.add('hidden'); msClose(); }

function addCommandRow() {
    const row = document.createElement('div');
    row.className = 'cmd-row';
    row.innerHTML = `
        <input type="text" placeholder="label" class="cmd-name" required>
        <input type="text" placeholder="npm run dev" class="cmd-val" required>
        <button type="button" class="icon-btn btn-remove-cmd" style="color:var(--red)">
            <i class="ph-bold ph-minus-circle"></i>
        </button>`;
    commandsList.appendChild(row);
    row.querySelector('.btn-remove-cmd').addEventListener('click', () => row.remove());
    return row;
}

// ═══════════════════════════════════════════════════════
//  FORM SUBMIT
// ═══════════════════════════════════════════════════════
projectForm.addEventListener('submit', async e => {
    e.preventDefault();
    const cmds = [];
    commandsList.querySelectorAll('.cmd-row').forEach(r => {
        const n = r.querySelector('.cmd-name').value.trim();
        const c = r.querySelector('.cmd-val').value.trim();
        if (n && c) cmds.push({ name: n, cmd: c });
    });
    const editId = document.getElementById('editProjectId').value;
    const existing = editId ? projects.find(p => p.id === editId) : null;
    const body = {
        name: document.getElementById('pName').value.trim(),
        path: document.getElementById('pPath').value.trim(),
        logo: document.getElementById('pLogo').value.trim(),
        ide: document.getElementById('pIde').value.trim(),
        notes: document.getElementById('pNotes').value.trim(),
        categories: msGetValue(),
        pinned: existing?.pinned || false,
        commands: cmds,
    };
    try {
        const r = await fetch(editId ? `${API_BASE}/${editId}` : API_BASE, {
            method: editId ? 'PUT' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        if (r.ok) { closeModal(); showToast(editId ? 'Project updated!' : 'Project added!', 'success'); fetchAll(); }
        else showToast('Failed to save.', 'error');
    } catch { showToast('Network error.', 'error'); }
});

// ═══════════════════════════════════════════════════════
//  EVENT LISTENERS
// ═══════════════════════════════════════════════════════
searchInput.addEventListener('input', e => { searchQuery = e.target.value; renderProjects(); });
addProjectBtn.addEventListener('click', openModal);
closeModalBtn.addEventListener('click', closeModal);
cancelModalBtn.addEventListener('click', closeModal);
addCmdBtn.addEventListener('click', addCommandRow);
addModal.addEventListener('click', e => { if (e.target === addModal) closeModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !addModal.classList.contains('hidden')) closeModal(); });

// ═══════════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════════
function escHtml(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function escAttr(s) { return String(s).replace(/'/g, '&#39;').replace(/"/g, '&quot;'); }

// ═══════════════════════════════════════════════════════
//  INIT
// ═══════════════════════════════════════════════════════
fetchAll();
