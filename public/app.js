import { api } from './api.js';
import {
    copyText,
    downloadBlob,
    escAttr,
    escHtml,
    formatCount,
    formatDateTime,
    getAvatarPalette,
    getInitials,
    getPromptTemplateText,
    getSchemaDefault,
    getStatusTone,
    parseTagsInput,
    prettyJson,
    renderPromptPreview,
    sanitizeClientFilename,
    tryParseJson,
} from './utils.js';

const state = {
    section: 'launcher',
    search: {
        launcher: '',
        mcp: '',
        prompts: '',
        markdown: '',
    },
    data: {
        categories: [],
        projects: [],
        mcpServers: [],
        prompts: [],
        markdownFiles: [],
    },
    launcher: {
        activeCategory: 'All',
        newCategoryOpen: false,
    },
    mcp: {
        selectedServerId: null,
        selectedToolName: null,
        inputMode: 'form',
        drafts: {},
        lastRun: null,
    },
    prompts: {
        activeFilter: 'All',
        selectedPromptId: null,
    },
    markdown: {
        activeFilter: 'All',
        selectedId: null,
        selectedIds: [],
        records: {},
    },
    runningCommands: {},
    ui: {
        loading: true,
        modal: null,
    },
};

const sections = [
    { id: 'launcher', label: 'Launcher', icon: 'ph-bold ph-rocket-launch' },
    { id: 'mcp', label: 'MCP', icon: 'ph-bold ph-plugs-connected' },
    { id: 'prompts', label: 'Prompts', icon: 'ph-bold ph-textbox' },
    { id: 'markdown', label: 'Markdown', icon: 'ph-bold ph-file-md' },
];

const dom = {
    sectionNav: document.getElementById('sectionNav'),
    sidebarTitle: document.getElementById('sidebarTitle'),
    sidebarSub: document.getElementById('sidebarSub'),
    sidebarPanel: document.getElementById('sidebarPanel'),
    sidebarActionBtn: document.getElementById('sidebarActionBtn'),
    headerTitle: document.getElementById('headerTitle'),
    headerSub: document.getElementById('headerSub'),
    globalSearch: document.getElementById('globalSearch'),
    primaryActionBtn: document.getElementById('primaryActionBtn'),
    sectionContent: document.getElementById('sectionContent'),
    modalRoot: document.getElementById('modalRoot'),
    toastContainer: document.getElementById('toast-container'),
    themeToggleBtn: document.getElementById('themeToggleBtn'),
    themeIcon: document.getElementById('themeIcon'),
    markdownUploadInput: document.getElementById('markdownUploadInput'),
};

let dragProjectId = null;

function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('vibe-theme', theme);
    dom.themeIcon.className = theme === 'dark' ? 'ph-bold ph-sun' : 'ph-bold ph-moon';
}

applyTheme(localStorage.getItem('vibe-theme') || 'dark');

function showToast(message, type = 'info', ms = 3200) {
    const icons = {
        success: 'ph-bold ph-check-circle',
        error: 'ph-bold ph-warning-circle',
        info: 'ph-bold ph-info',
    };

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<i class="${icons[type] || icons.info}"></i><span>${escHtml(message)}</span>`;
    dom.toastContainer.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('fade-out');
        setTimeout(() => toast.remove(), 280);
    }, ms);
}

function getSearchValue() {
    return state.search[state.section] || '';
}

function setSearchValue(value) {
    state.search[state.section] = value;
}

function getSelectedServer() {
    return state.data.mcpServers.find(server => server.id === state.mcp.selectedServerId) || null;
}

function getVisibleTools(server = getSelectedServer()) {
    if (!server) return [];
    const query = getSearchValue().trim().toLowerCase();
    if (!query) return server.tools || [];

    return (server.tools || []).filter(tool =>
        [tool.name, tool.title, tool.description]
            .filter(Boolean)
            .some(value => value.toLowerCase().includes(query)),
    );
}

function getSelectedTool(server = getSelectedServer()) {
    if (!server) return null;
    return (server.tools || []).find(tool => tool.name === state.mcp.selectedToolName) || null;
}

function getPromptFilters() {
    const filters = [
        { key: 'All', label: 'All Prompts', count: state.data.prompts.length, icon: 'ph-bold ph-squares-four' },
        {
            key: 'Favorites',
            label: 'Favorites',
            count: state.data.prompts.filter(prompt => prompt.favorite).length,
            icon: 'ph-bold ph-star',
        },
    ];

    const tagCounts = {};
    state.data.prompts.forEach(prompt => {
        (prompt.tags || []).forEach(tag => {
            tagCounts[tag] = (tagCounts[tag] || 0) + 1;
        });
    });

    Object.keys(tagCounts).sort((left, right) => left.localeCompare(right)).forEach(tag => {
        filters.push({
            key: `tag:${tag}`,
            label: tag,
            count: tagCounts[tag],
            icon: 'ph-bold ph-hash',
        });
    });

    return filters;
}

function getVisiblePrompts() {
    const query = getSearchValue().trim().toLowerCase();
    let list = [...state.data.prompts];

    if (state.prompts.activeFilter === 'Favorites') {
        list = list.filter(prompt => prompt.favorite);
    } else if (state.prompts.activeFilter.startsWith('tag:')) {
        const tag = state.prompts.activeFilter.slice(4);
        list = list.filter(prompt => (prompt.tags || []).includes(tag));
    }

    if (query) {
        list = list.filter(prompt => {
            const haystack = [
                prompt.title,
                prompt.description,
                (prompt.tags || []).join(' '),
                prompt.template,
                (prompt.messages || []).map(message => `${message.role} ${message.content}`).join(' '),
                prompt.exampleOutput,
                prompt.notes,
            ].join(' ').toLowerCase();

            return haystack.includes(query);
        });
    }

    return list.sort((left, right) => {
        if (left.favorite !== right.favorite) return left.favorite ? -1 : 1;
        return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
    });
}

function getSelectedPrompt() {
    return state.data.prompts.find(prompt => prompt.id === state.prompts.selectedPromptId) || null;
}

function getMarkdownFilters() {
    const filters = [
        { key: 'All', label: 'All Files', count: state.data.markdownFiles.length, icon: 'ph-bold ph-files' },
    ];

    const tagCounts = {};
    state.data.markdownFiles.forEach(file => {
        (file.tags || []).forEach(tag => {
            tagCounts[tag] = (tagCounts[tag] || 0) + 1;
        });
    });

    Object.keys(tagCounts).sort((left, right) => left.localeCompare(right)).forEach(tag => {
        filters.push({
            key: `tag:${tag}`,
            label: tag,
            count: tagCounts[tag],
            icon: 'ph-bold ph-hash',
        });
    });

    return filters;
}

function getVisibleMarkdownFiles() {
    const query = getSearchValue().trim().toLowerCase();
    let list = [...state.data.markdownFiles];

    if (state.markdown.activeFilter.startsWith('tag:')) {
        const tag = state.markdown.activeFilter.slice(4);
        list = list.filter(file => (file.tags || []).includes(tag));
    }

    if (query) {
        list = list.filter(file => {
            const haystack = [
                file.title,
                file.filename,
                file.description,
                file.excerpt,
                (file.tags || []).join(' '),
            ].join(' ').toLowerCase();
            return haystack.includes(query);
        });
    }

    return list.sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime());
}

function getSelectedMarkdownMeta() {
    return state.data.markdownFiles.find(file => file.id === state.markdown.selectedId) || null;
}

function getVisibleProjects() {
    const query = getSearchValue().trim().toLowerCase();
    let list = [...state.data.projects];

    if (state.launcher.activeCategory !== 'All') {
        list = list.filter(project => (project.categories || []).includes(state.launcher.activeCategory));
    }

    if (query) {
        list = list.filter(project => {
            const haystack = [
                project.name,
                project.path,
                project.notes,
                project.ide,
                (project.categories || []).join(' '),
            ].join(' ').toLowerCase();

            return haystack.includes(query);
        });
    }

    return list.sort((left, right) => {
        if (left.pinned !== right.pinned) return left.pinned ? -1 : 1;
        return 0;
    });
}

function syncSelections() {
    const categoryExists = state.launcher.activeCategory === 'All'
        || state.data.categories.includes(state.launcher.activeCategory)
        || state.data.projects.some(project => (project.categories || []).includes(state.launcher.activeCategory));
    if (!categoryExists) state.launcher.activeCategory = 'All';

    if (!getSelectedServer()) {
        state.mcp.selectedServerId = state.data.mcpServers[0]?.id || null;
    }

    const currentServer = getSelectedServer();
    if (!currentServer) {
        state.mcp.selectedToolName = null;
    } else if (!(currentServer.tools || []).some(tool => tool.name === state.mcp.selectedToolName)) {
        state.mcp.selectedToolName = currentServer.tools?.[0]?.name || null;
    }

    const filterExists = getPromptFilters().some(filter => filter.key === state.prompts.activeFilter);
    if (!filterExists) state.prompts.activeFilter = 'All';

    const visiblePrompts = getVisiblePrompts();
    if (!visiblePrompts.some(prompt => prompt.id === state.prompts.selectedPromptId)) {
        state.prompts.selectedPromptId = visiblePrompts[0]?.id || null;
    }

    const markdownFilterExists = getMarkdownFilters().some(filter => filter.key === state.markdown.activeFilter);
    if (!markdownFilterExists) state.markdown.activeFilter = 'All';

    const visibleMarkdownFiles = getVisibleMarkdownFiles();
    if (!visibleMarkdownFiles.some(file => file.id === state.markdown.selectedId)) {
        state.markdown.selectedId = visibleMarkdownFiles[0]?.id || null;
    }

    const validMarkdownIds = new Set(state.data.markdownFiles.map(file => file.id));
    state.markdown.selectedIds = state.markdown.selectedIds.filter(id => validMarkdownIds.has(id));
    state.markdown.records = Object.fromEntries(
        Object.entries(state.markdown.records).filter(([id]) => validMarkdownIds.has(id)),
    );
}

function getSectionHeader() {
    if (state.section === 'launcher') {
        const visible = getVisibleProjects().length;
        return {
            title: state.launcher.activeCategory === 'All' ? 'Project Launcher' : state.launcher.activeCategory,
            sub: `${formatCount(visible, 'project', 'projects')} visible across ${formatCount(state.data.categories.length, 'workspace', 'workspaces')}.`,
            searchPlaceholder: 'Search projects',
            primaryLabel: 'New Project',
        };
    }

    if (state.section === 'mcp') {
        const online = state.data.mcpServers.filter(server => server.lastStatus === 'online').length;
        return {
            title: 'MCP Servers',
            sub: `${formatCount(state.data.mcpServers.length, 'server', 'servers')} configured, ${formatCount(online, 'server online', 'servers online')}.`,
            searchPlaceholder: 'Search selected server tools',
            primaryLabel: 'New Server',
        };
    }

    if (state.section === 'prompts') {
        const tagCount = getPromptFilters().filter(filter => filter.key.startsWith('tag:')).length;
        return {
            title: 'Prompt Library',
            sub: `${formatCount(state.data.prompts.length, 'prompt', 'prompts')} organized with ${formatCount(tagCount, 'tag', 'tags')}.`,
            searchPlaceholder: 'Search prompts',
            primaryLabel: 'New Prompt',
        };
    }

    return {
        title: 'Markdown Library',
        sub: `${formatCount(state.data.markdownFiles.length, 'file', 'files')} with ${formatCount(getMarkdownFilters().filter(filter => filter.key.startsWith('tag:')).length, 'tag', 'tags')}.`,
        searchPlaceholder: 'Search markdown files',
        primaryLabel: 'Import Markdown',
    };
}

function renderSectionNav() {
    dom.sectionNav.innerHTML = sections.map(section => `
        <button
            type="button"
            class="section-nav-btn ${state.section === section.id ? 'active' : ''}"
            data-action="switch-section"
            data-section="${section.id}">
            <i class="${section.icon}"></i>
            <span>${section.label}</span>
        </button>
    `).join('');
}

function renderSidebar() {
    const header = state.section === 'launcher'
        ? { title: 'Workspaces', sub: 'Filter projects by category.', canAdd: true }
        : state.section === 'mcp'
            ? { title: 'Servers', sub: 'Select a server to inspect and test.', canAdd: false }
            : state.section === 'prompts'
                ? { title: 'Tags', sub: 'Slice the library by purpose.', canAdd: false }
                : { title: 'Markdown Tags', sub: 'Group and export files by tag.', canAdd: false };

    dom.sidebarTitle.textContent = header.title;
    dom.sidebarSub.textContent = header.sub;
    dom.sidebarActionBtn.classList.toggle('hidden', !header.canAdd);
    dom.sidebarPanel.innerHTML = state.section === 'launcher'
        ? renderLauncherSidebar()
        : state.section === 'mcp'
            ? renderMcpSidebar()
            : state.section === 'prompts'
                ? renderPromptSidebar()
                : renderMarkdownSidebar();
}

function renderLauncherSidebar() {
    const counts = {};
    state.data.projects.forEach(project => {
        (project.categories || []).forEach(category => {
            counts[category] = (counts[category] || 0) + 1;
        });
    });

    const categories = [...new Set([...state.data.categories, ...Object.keys(counts)])].sort((left, right) => left.localeCompare(right));

    return `
        <form id="categoryForm" class="inline-form ${state.launcher.newCategoryOpen ? '' : 'hidden'}">
            <input type="text" name="name" placeholder="New workspace name">
            <button type="submit" class="btn primary-btn btn-small">Save</button>
        </form>

        <div class="sidebar-list">
            <button type="button" class="sidebar-list-item ${state.launcher.activeCategory === 'All' ? 'active' : ''}" data-action="select-category" data-category="All">
                <span class="sidebar-item-copy"><i class="ph-bold ph-squares-four"></i>All Projects</span>
                <span class="sidebar-count">${state.data.projects.length}</span>
            </button>

            ${categories.map(category => `
                <button type="button" class="sidebar-list-item ${state.launcher.activeCategory === category ? 'active' : ''}" data-action="select-category" data-category="${escAttr(category)}">
                    <span class="sidebar-item-copy"><i class="ph-bold ph-folder-simple"></i>${escHtml(category)}</span>
                    <span class="sidebar-item-actions">
                        <span class="sidebar-count">${counts[category] || 0}</span>
                        <span class="ghost-icon" data-action="delete-category" data-category="${escAttr(category)}"><i class="ph-bold ph-x"></i></span>
                    </span>
                </button>
            `).join('')}
        </div>
    `;
}

function renderMcpSidebar() {
    if (!state.data.mcpServers.length) {
        return `
            <div class="empty-side-state">
                <i class="ph-bold ph-plugs-connected"></i>
                <p>No servers yet</p>
            </div>
        `;
    }

    return `
        <div class="sidebar-list">
            ${state.data.mcpServers.map(server => `
                <button type="button" class="sidebar-list-item ${state.mcp.selectedServerId === server.id ? 'active' : ''}" data-action="select-server" data-server-id="${server.id}">
                    <span class="sidebar-item-stack">
                        <span class="sidebar-item-copy">
                            <span class="status-dot ${getStatusTone(server.lastStatus)}"></span>
                            ${escHtml(server.name)}
                        </span>
                        <span class="sidebar-meta">${escHtml(server.transport)}</span>
                    </span>
                    <span class="sidebar-count">${(server.tools || []).length}</span>
                </button>
            `).join('')}
        </div>
    `;
}

function renderPromptSidebar() {
    return `
        <div class="sidebar-list">
            ${getPromptFilters().map(filter => `
                <button type="button" class="sidebar-list-item ${state.prompts.activeFilter === filter.key ? 'active' : ''}" data-action="select-prompt-filter" data-filter="${escAttr(filter.key)}">
                    <span class="sidebar-item-copy"><i class="${filter.icon}"></i>${escHtml(filter.label)}</span>
                    <span class="sidebar-count">${filter.count}</span>
                </button>
            `).join('')}
        </div>
    `;
}

function renderMarkdownSidebar() {
    return `
        <div class="sidebar-list">
            ${getMarkdownFilters().map(filter => `
                <button type="button" class="sidebar-list-item ${state.markdown.activeFilter === filter.key ? 'active' : ''}" data-action="select-markdown-filter" data-filter="${escAttr(filter.key)}">
                    <span class="sidebar-item-copy"><i class="${filter.icon}"></i>${escHtml(filter.label)}</span>
                    <span class="sidebar-count">${filter.count}</span>
                </button>
            `).join('')}
        </div>
    `;
}

function renderHeader() {
    const header = getSectionHeader();
    dom.headerTitle.textContent = header.title;
    dom.headerSub.textContent = header.sub;
    dom.globalSearch.value = getSearchValue();
    dom.globalSearch.placeholder = header.searchPlaceholder;
    dom.primaryActionBtn.textContent = header.primaryLabel;
}

function renderStats(items) {
    return `
        <div class="stats-grid">
            ${items.map(item => `
                <article class="stat-card">
                    <span class="stat-label">${escHtml(item.label)}</span>
                    <strong>${escHtml(String(item.value))}</strong>
                </article>
            `).join('')}
        </div>
    `;
}

function renderProjectCard(project) {
    const palette = getAvatarPalette(project.name);
    const initials = getInitials(project.name);
    const commands = (project.commands || []).map((command, index) => {
        const key = `${project.id}:${index}`;
        const running = Boolean(state.runningCommands[key]);
        return `
            <button type="button" class="chip-btn ${running ? 'running' : ''}"
                data-action="${running ? 'stop-project-command' : 'execute-project-command'}"
                data-project-id="${project.id}"
                data-command-index="${index}"
                data-command-name="${escAttr(command.name)}">
                <i class="${running ? 'ph-fill ph-circle' : 'ph-bold ph-play'}"></i>
                <span>${escHtml(command.name)}</span>
            </button>
        `;
    }).join('');

    return `
        <article class="project-card" draggable="${state.launcher.activeCategory === 'All' && !getSearchValue().trim() ? 'true' : 'false'}" data-project-id="${project.id}">
            <div class="card-actions-top">
                <button type="button" class="icon-btn" data-action="toggle-project-pin" data-project-id="${project.id}" title="${project.pinned ? 'Unpin' : 'Pin'}">
                    <i class="ph-${project.pinned ? 'fill' : 'bold'} ph-star ${project.pinned ? 'starred' : ''}"></i>
                </button>
                <button type="button" class="icon-btn" data-action="edit-project" data-project-id="${project.id}" title="Edit">
                    <i class="ph-bold ph-pencil-simple"></i>
                </button>
                <button type="button" class="icon-btn danger" data-action="delete-project" data-project-id="${project.id}" title="Delete">
                    <i class="ph-bold ph-trash"></i>
                </button>
            </div>

            <div class="card-header">
                <div class="project-avatar" style="--av-bg:${palette.bg};--av-fg:${palette.fg}">
                    ${project.logo
            ? `<img src="${escAttr(project.logo)}" alt="" onerror="this.remove();this.parentElement.textContent='${escAttr(initials)}';">`
            : initials}
                </div>

                <div class="card-title">
                    <h3>${escHtml(project.name)}</h3>
                    <div class="card-path" title="${escAttr(project.path)}">${escHtml(project.path)}</div>
                    <div class="chip-row">
                        ${(project.categories || []).map(category => `<span class="soft-chip">${escHtml(category)}</span>`).join('')}
                    </div>
                </div>
            </div>

            ${project.notes ? `<div class="card-note">${escHtml(project.notes)}</div>` : ''}

            <div class="card-footer">
                <button type="button" class="chip-btn accent" data-action="open-project-ide" data-project-id="${project.id}">
                    <i class="ph-bold ph-terminal-window"></i>
                    <span>${escHtml(project.ide || 'IDE')}</span>
                </button>
                ${commands}
            </div>
        </article>
    `;
}

function renderLauncherSection() {
    const visibleProjects = getVisibleProjects();
    const stats = [
        { label: 'Projects', value: state.data.projects.length },
        { label: 'Pinned', value: state.data.projects.filter(project => project.pinned).length },
        { label: 'Workspaces', value: state.data.categories.length },
    ];

    return `
        ${renderStats(stats)}

        ${visibleProjects.length
            ? `<div class="projects-grid">${visibleProjects.map(renderProjectCard).join('')}</div>`
            : `
                <div class="empty-state">
                    <i class="ph-duotone ph-rocket-launch"></i>
                    <h2>${state.data.projects.length ? 'No projects match this filter' : 'No projects yet'}</h2>
                    <p>${state.data.projects.length
                ? 'Try another search or workspace.'
                : 'Add your first project to turn this into a real launcher.'}</p>
                </div>
            `}
    `;
}

function renderCapabilityPill(label, active) {
    return `<span class="pill ${active ? 'active' : ''}">${escHtml(label)}</span>`;
}

function getToolDraftKey(serverId, toolName) {
    return `${serverId}:${toolName}`;
}

function ensureToolDraft(serverId, tool) {
    const key = getToolDraftKey(serverId, tool.name);
    if (!state.mcp.drafts[key]) {
        const values = {};
        Object.entries(tool.inputSchema?.properties || {}).forEach(([propertyName, schema]) => {
            const defaultValue = getSchemaDefault(schema);
            if (defaultValue !== undefined) values[propertyName] = defaultValue;
        });

        state.mcp.drafts[key] = {
            values,
            rawText: prettyJson(values),
            jsonFields: {},
        };
    }

    return state.mcp.drafts[key];
}

function renderToolField(server, tool, propertyName, schema, required) {
    const draft = ensureToolDraft(server.id, tool);
    const rawValue = draft.values[propertyName];
    const description = schema.description ? `<p class="field-help">${escHtml(schema.description)}</p>` : '';
    const example = getSchemaDefault(schema);
    const exampleText = example !== undefined ? `<span class="field-hint">Default: ${escHtml(typeof example === 'string' ? example : JSON.stringify(example))}</span>` : '';

    if (Array.isArray(schema.enum) && schema.enum.length) {
        return `
            <label class="form-group">
                <span>${escHtml(propertyName)} ${required ? '<em>Required</em>' : ''}</span>
                <select data-tool-field="${escAttr(propertyName)}">
                    <option value="">Select an option</option>
                    ${schema.enum.map(option => `
                        <option value="${escAttr(option)}" ${String(rawValue ?? '') === String(option) ? 'selected' : ''}>${escHtml(String(option))}</option>
                    `).join('')}
                </select>
                ${description}
                ${exampleText}
            </label>
        `;
    }

    if (schema.type === 'boolean') {
        return `
            <label class="checkbox-field">
                <input type="checkbox" data-tool-field="${escAttr(propertyName)}" ${rawValue ? 'checked' : ''}>
                <span>${escHtml(propertyName)} ${required ? '<em>Required</em>' : ''}</span>
            </label>
            ${description}
        `;
    }

    if (schema.type === 'object' || schema.type === 'array') {
        const value = draft.jsonFields?.[propertyName]
            ?? (rawValue !== undefined ? prettyJson(rawValue) : '');

        return `
            <label class="form-group">
                <span>${escHtml(propertyName)} ${required ? '<em>Required</em>' : ''}</span>
                <textarea rows="5" data-tool-field="${escAttr(propertyName)}" data-json-field="true" placeholder='${escAttr(schema.type === 'array' ? '[]' : '{}')}'>${escHtml(value)}</textarea>
                ${description}
                ${exampleText}
            </label>
        `;
    }

    if (schema.type === 'number' || schema.type === 'integer') {
        return `
            <label class="form-group">
                <span>${escHtml(propertyName)} ${required ? '<em>Required</em>' : ''}</span>
                <input
                    type="number"
                    step="${schema.type === 'integer' ? '1' : 'any'}"
                    data-tool-field="${escAttr(propertyName)}"
                    value="${rawValue ?? ''}">
                ${description}
                ${exampleText}
            </label>
        `;
    }

    const useTextarea = schema.format === 'textarea' || (typeof rawValue === 'string' && rawValue.includes('\n'));
    if (useTextarea) {
        return `
            <label class="form-group">
                <span>${escHtml(propertyName)} ${required ? '<em>Required</em>' : ''}</span>
                <textarea rows="4" data-tool-field="${escAttr(propertyName)}">${escHtml(rawValue ?? '')}</textarea>
                ${description}
                ${exampleText}
            </label>
        `;
    }

    return `
        <label class="form-group">
            <span>${escHtml(propertyName)} ${required ? '<em>Required</em>' : ''}</span>
            <input type="text" data-tool-field="${escAttr(propertyName)}" value="${escAttr(rawValue ?? '')}">
            ${description}
            ${exampleText}
        </label>
    `;
}

function renderToolResult(result) {
    if (!result) {
        return `
            <div class="empty-panel">
                <i class="ph-bold ph-cursor-click"></i>
                <p>Run a tool to inspect its response.</p>
            </div>
        `;
    }

    return `
        <div class="result-block">
            <div class="result-header">
                <span class="pill ${result.isError ? 'danger' : 'active'}">${result.isError ? 'Error Result' : 'Success Result'}</span>
                <span class="muted">${formatDateTime(result.executedAt)}</span>
            </div>

            ${result.textOutput
            ? `
                <div class="result-section">
                    <h4>Text Output</h4>
                    <pre>${escHtml(result.textOutput)}</pre>
                </div>
            `
            : ''}

            ${result.structuredContent
            ? `
                <div class="result-section">
                    <h4>Structured Output</h4>
                    <pre>${escHtml(prettyJson(result.structuredContent))}</pre>
                </div>
            `
            : ''}

            ${(result.content || []).filter(item => item.type !== 'text').length
            ? `
                <div class="result-section">
                    <h4>Content Blocks</h4>
                    <div class="content-list">
                        ${(result.content || []).filter(item => item.type !== 'text').map(item => `
                            <div class="content-item">
                                <span class="pill">${escHtml(item.type)}</span>
                                <pre>${escHtml(prettyJson(item))}</pre>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `
            : ''}
        </div>
    `;
}

function renderHistory(server, toolName) {
    const history = (server.history || []).filter(entry => entry.toolName === toolName).slice(0, 6);

    if (!history.length) {
        return `
            <div class="empty-panel compact">
                <i class="ph-bold ph-clock-counter-clockwise"></i>
                <p>No runs saved for this tool yet.</p>
            </div>
        `;
    }

    return `
        <div class="history-list">
            ${history.map(entry => `
                <article class="history-item">
                    <div>
                        <div class="history-top">
                            <span class="pill ${entry.success ? 'active' : 'danger'}">${entry.success ? 'Pass' : 'Error'}</span>
                            <span class="muted">${formatDateTime(entry.timestamp)}</span>
                        </div>
                        <p>${escHtml(entry.preview || 'Previous run')}</p>
                    </div>
                    <button type="button" class="btn secondary-btn btn-small" data-action="apply-history-payload" data-tool-name="${escAttr(entry.toolName)}" data-history-id="${entry.id}">
                        Reuse payload
                    </button>
                </article>
            `).join('')}
        </div>
    `;
}

function renderMcpSection() {
    const server = getSelectedServer();
    const totalTools = state.data.mcpServers.reduce((sum, item) => sum + (item.tools || []).length, 0);
    const stats = [
        { label: 'Servers', value: state.data.mcpServers.length },
        { label: 'Online', value: state.data.mcpServers.filter(item => item.lastStatus === 'online').length },
        { label: 'Cached Tools', value: totalTools },
    ];

    if (!server) {
        return `
            ${renderStats(stats)}
            <div class="empty-state">
                <i class="ph-bold ph-plugs-connected"></i>
                <h2>No MCP servers configured</h2>
                <p>Add a server profile, then discover tools and test them like a lightweight Swagger workbench.</p>
            </div>
        `;
    }

    const visibleTools = getVisibleTools(server);
    const selectedTool = getSelectedTool(server);
    const lastRun = state.mcp.lastRun
        && state.mcp.lastRun.serverId === server.id
        && state.mcp.lastRun.toolName === selectedTool?.name
        ? state.mcp.lastRun
        : null;

    const schemaProperties = selectedTool?.inputSchema?.properties || {};
    const requiredFields = new Set(selectedTool?.inputSchema?.required || []);
    const supportsForm = Boolean(selectedTool && selectedTool.inputSchema?.type === 'object' && !selectedTool.inputSchema?.oneOf && !selectedTool.inputSchema?.anyOf && !selectedTool.inputSchema?.allOf);

    return `
        ${renderStats(stats)}

        <div class="hero-card">
            <div class="hero-copy">
                <div class="hero-title-row">
                    <h2>${escHtml(server.name)}</h2>
                    <span class="pill ${getStatusTone(server.lastStatus)}">${escHtml(server.lastStatus)}</span>
                </div>
                <p>${escHtml(server.description || 'No description added yet.')}</p>
                <div class="chip-row">
                    <span class="soft-chip">${escHtml(server.transport)}</span>
                    ${server.command ? `<span class="soft-chip">${escHtml(server.command)}</span>` : ''}
                    ${server.timeout ? `<span class="soft-chip">${escHtml(`${server.timeout} ms timeout`)}</span>` : ''}
                    ${renderCapabilityPill('Tools', Boolean(server.capabilities?.tools))}
                    ${renderCapabilityPill('Prompts', Boolean(server.capabilities?.prompts))}
                    ${renderCapabilityPill('Resources', Boolean(server.capabilities?.resources))}
                </div>
                <div class="meta-row">
                    <span><strong>Last checked:</strong> ${escHtml(formatDateTime(server.lastCheckedAt))}</span>
                    ${server.lastError ? `<span class="danger-text"><strong>Last error:</strong> ${escHtml(server.lastError)}</span>` : ''}
                </div>
            </div>
            <div class="hero-actions">
                <button type="button" class="btn secondary-btn" data-action="discover-server" data-server-id="${server.id}">
                    <i class="ph-bold ph-arrows-clockwise"></i> Refresh Tools
                </button>
                <button type="button" class="btn secondary-btn" data-action="edit-server" data-server-id="${server.id}">
                    <i class="ph-bold ph-sliders-horizontal"></i> Edit Profile
                </button>
                <button type="button" class="btn secondary-btn danger-outline" data-action="delete-server" data-server-id="${server.id}">
                    <i class="ph-bold ph-trash"></i> Delete
                </button>
            </div>
        </div>

        <div class="workbench-grid">
            <section class="stack-panel">
                <div class="panel-heading">
                    <div>
                        <h3>Tool Catalog</h3>
                        <p>${formatCount(visibleTools.length, 'tool', 'tools')} visible</p>
                    </div>
                </div>

                ${visibleTools.length
            ? `<div class="tool-list">
                        ${visibleTools.map(tool => `
                            <button type="button" class="tool-list-item ${selectedTool?.name === tool.name ? 'active' : ''}" data-action="select-tool" data-tool-name="${escAttr(tool.name)}">
                                <div>
                                    <strong>${escHtml(tool.title || tool.name)}</strong>
                                    <p>${escHtml(tool.description || 'No description')}</p>
                                </div>
                                <div class="chip-row compact">
                                    ${tool.annotations?.readOnlyHint ? '<span class="pill">Read only</span>' : ''}
                                    ${tool.annotations?.destructiveHint ? '<span class="pill danger">Destructive</span>' : ''}
                                    ${tool.execution?.taskSupport ? `<span class="pill">${escHtml(tool.execution.taskSupport)}</span>` : ''}
                                </div>
                            </button>
                        `).join('')}
                    </div>`
            : `
                    <div class="empty-panel">
                        <i class="ph-bold ph-toolbox"></i>
                        <p>${server.tools?.length ? 'No tools match the current search.' : 'Discover the server to load its tools.'}</p>
                    </div>
                `}
            </section>

            <section class="stack-panel">
                ${selectedTool
            ? renderSelectedToolPanel(server, selectedTool, schemaProperties, requiredFields, supportsForm, lastRun)
            : `
                    <div class="empty-panel large">
                        <i class="ph-bold ph-cursor-click"></i>
                        <p>Select a tool to inspect its schema and test it.</p>
                    </div>
                `}
            </section>
        </div>
    `;
}

function renderSelectedToolPanel(server, selectedTool, schemaProperties, requiredFields, supportsForm, lastRun) {
    return `
        <div class="panel-heading">
            <div>
                <h3>${escHtml(selectedTool.title || selectedTool.name)}</h3>
                <p>${escHtml(selectedTool.description || 'No description')}</p>
            </div>

            <div class="segmented-control">
                <button type="button" class="${state.mcp.inputMode === 'form' ? 'active' : ''}" data-action="set-tool-mode" data-mode="form" ${supportsForm ? '' : 'disabled'}>Form</button>
                <button type="button" class="${state.mcp.inputMode === 'json' ? 'active' : ''}" data-action="set-tool-mode" data-mode="json">JSON</button>
            </div>
        </div>

        <form id="toolRunForm" class="tool-form">
            <div class="tool-doc-grid">
                <div class="doc-box">
                    <h4>Input Schema</h4>
                    <pre>${escHtml(prettyJson(selectedTool.inputSchema || {}))}</pre>
                </div>
                <div class="doc-box">
                    <h4>Output Schema</h4>
                    <pre>${escHtml(prettyJson(selectedTool.outputSchema || {}))}</pre>
                </div>
            </div>

            ${state.mcp.inputMode === 'json' || !supportsForm
            ? `
                    <label class="form-group">
                        <span>Arguments JSON</span>
                        <textarea name="toolRawJson" rows="14" placeholder="{}">${escHtml(ensureToolDraft(server.id, selectedTool).rawText || '{}')}</textarea>
                    </label>
                `
            : `
                    <div class="tool-fields-grid">
                        ${Object.entries(schemaProperties).length
                ? Object.entries(schemaProperties).map(([propertyName, schema]) =>
                    renderToolField(server, selectedTool, propertyName, schema, requiredFields.has(propertyName))).join('')
                : '<div class="empty-panel compact"><p>This tool does not require arguments.</p></div>'}
                    </div>
                `}

            <div class="form-actions">
                <button type="submit" class="btn primary-btn">
                    <i class="ph-bold ph-paper-plane-tilt"></i> Run Tool
                </button>
            </div>
        </form>

        <div class="result-layout">
            <div class="stack-panel nested">
                <div class="panel-heading compact">
                    <div>
                        <h3>Latest Result</h3>
                        <p>Rendered output from the tool call.</p>
                    </div>
                </div>
                ${renderToolResult(lastRun)}
            </div>

            <div class="stack-panel nested">
                <div class="panel-heading compact">
                    <div>
                        <h3>Recent Runs</h3>
                        <p>Reuse saved inputs for fast retesting.</p>
                    </div>
                </div>
                ${renderHistory(server, selectedTool.name)}
            </div>
        </div>
    `;
}

function renderPromptCard(prompt, selected) {
    return `
        <article class="prompt-card ${selected ? 'selected' : ''}" data-action="select-prompt" data-prompt-id="${prompt.id}">
            <div class="card-actions-top prompt-actions">
                <button type="button" class="icon-btn" data-action="toggle-prompt-favorite" data-prompt-id="${prompt.id}" title="${prompt.favorite ? 'Unfavorite' : 'Favorite'}">
                    <i class="ph-${prompt.favorite ? 'fill' : 'bold'} ph-star ${prompt.favorite ? 'starred' : ''}"></i>
                </button>
                <button type="button" class="icon-btn" data-action="duplicate-prompt" data-prompt-id="${prompt.id}" title="Duplicate">
                    <i class="ph-bold ph-copy"></i>
                </button>
                <button type="button" class="icon-btn" data-action="edit-prompt" data-prompt-id="${prompt.id}" title="Edit">
                    <i class="ph-bold ph-pencil-simple"></i>
                </button>
                <button type="button" class="icon-btn danger" data-action="delete-prompt" data-prompt-id="${prompt.id}" title="Delete">
                    <i class="ph-bold ph-trash"></i>
                </button>
            </div>

            <div class="prompt-card-head">
                <span class="pill ${prompt.format === 'chat' ? 'active' : ''}">${escHtml(prompt.format)}</span>
                <span class="muted">${escHtml(formatDateTime(prompt.updatedAt))}</span>
            </div>

            <h3>${escHtml(prompt.title)}</h3>
            <p>${escHtml(prompt.description || 'No description')}</p>

            <div class="chip-row">
                ${(prompt.tags || []).map(tag => `<span class="soft-chip">${escHtml(tag)}</span>`).join('')}
            </div>
        </article>
    `;
}

function renderPromptDetail(prompt) {
    if (!prompt) {
        return `
            <div class="empty-panel large">
                <i class="ph-bold ph-textbox"></i>
                <p>Select a prompt to inspect its template, preview, and notes.</p>
            </div>
        `;
    }

    const preview = renderPromptPreview(prompt);
    const templateText = getPromptTemplateText(prompt);

    return `
        <div class="detail-panel">
            <div class="panel-heading">
                <div>
                    <h3>${escHtml(prompt.title)}</h3>
                    <p>${escHtml(prompt.description || 'No description')}</p>
                </div>
                <div class="chip-row compact">
                    <button type="button" class="btn secondary-btn btn-small" data-action="copy-prompt-template" data-prompt-id="${prompt.id}">
                        <i class="ph-bold ph-copy"></i> Copy Template
                    </button>
                    <button type="button" class="btn secondary-btn btn-small" data-action="copy-prompt-rendered" data-prompt-id="${prompt.id}">
                        <i class="ph-bold ph-sparkle"></i> Copy Preview
                    </button>
                </div>
            </div>

            <div class="chip-row">
                <span class="soft-chip">${escHtml(prompt.format)}</span>
                ${(prompt.tags || []).map(tag => `<span class="soft-chip">${escHtml(tag)}</span>`).join('')}
            </div>

            <div class="detail-stack">
                <div class="doc-box">
                    <h4>Rendered Preview</h4>
                    <pre>${escHtml(preview || 'No preview yet.')}</pre>
                </div>

                <div class="detail-grid">
                    <div class="doc-box">
                        <h4>Template</h4>
                        <pre>${escHtml(templateText || 'No template')}</pre>
                    </div>

                    <div class="doc-box">
                        <h4>Example Variables</h4>
                        <pre>${escHtml(prettyJson(prompt.exampleVariables || {}))}</pre>
                    </div>
                </div>

                <div class="detail-grid">
                    <div class="doc-box">
                        <h4>Example Output</h4>
                        <pre>${escHtml(prompt.exampleOutput || 'No example output')}</pre>
                    </div>

                    <div class="doc-box">
                        <h4>Notes</h4>
                        <pre>${escHtml(prompt.notes || 'No notes')}</pre>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function renderPromptsSection() {
    const visiblePrompts = getVisiblePrompts();
    const selectedPrompt = getSelectedPrompt();
    const stats = [
        { label: 'Prompts', value: state.data.prompts.length },
        { label: 'Favorites', value: state.data.prompts.filter(prompt => prompt.favorite).length },
        { label: 'Visible', value: visiblePrompts.length },
    ];

    return `
        ${renderStats(stats)}

        <div class="prompt-layout">
            <section class="stack-panel">
                <div class="panel-heading">
                    <div>
                        <h3>Library</h3>
                        <p>${formatCount(visiblePrompts.length, 'prompt', 'prompts')} in this view</p>
                    </div>
                </div>

                ${visiblePrompts.length
            ? `<div class="prompt-list">${visiblePrompts.map(prompt => renderPromptCard(prompt, prompt.id === selectedPrompt?.id)).join('')}</div>`
            : `
                    <div class="empty-panel">
                        <i class="ph-bold ph-magnifying-glass"></i>
                        <p>${state.data.prompts.length ? 'No prompts match the current filter.' : 'Create your first reusable prompt.'}</p>
                    </div>
                `}
            </section>

            <section class="stack-panel">
                ${renderPromptDetail(selectedPrompt)}
            </section>
        </div>
    `;
}

function getSelectedMarkdownRecord() {
    return state.markdown.selectedId ? state.markdown.records[state.markdown.selectedId] || null : null;
}

function renderMarkdownListItem(file, selected) {
    const checked = state.markdown.selectedIds.includes(file.id);
    return `
        <article class="markdown-item ${selected ? 'selected' : ''}">
            <div class="markdown-item-top">
                <label class="checkbox-field compact markdown-check">
                    <input type="checkbox" data-action="toggle-markdown-selection" data-markdown-id="${file.id}" ${checked ? 'checked' : ''}>
                    <span></span>
                </label>
                <button type="button" class="markdown-item-main" data-action="select-markdown-file" data-markdown-id="${file.id}">
                    <strong>${escHtml(file.title)}</strong>
                    <span class="muted">${escHtml(file.filename)}</span>
                    <p>${escHtml(file.excerpt || file.description || 'No preview yet.')}</p>
                    <div class="chip-row compact">
                        ${(file.tags || []).map(tag => `<span class="soft-chip">${escHtml(tag)}</span>`).join('')}
                    </div>
                </button>
            </div>
            <div class="markdown-item-actions">
                <button type="button" class="icon-btn" data-action="download-markdown-file" data-markdown-id="${file.id}" title="Download">
                    <i class="ph-bold ph-download-simple"></i>
                </button>
                <button type="button" class="icon-btn" data-action="edit-markdown-file" data-markdown-id="${file.id}" title="Edit">
                    <i class="ph-bold ph-pencil-simple"></i>
                </button>
                <button type="button" class="icon-btn danger" data-action="delete-markdown-file" data-markdown-id="${file.id}" title="Delete">
                    <i class="ph-bold ph-trash"></i>
                </button>
            </div>
        </article>
    `;
}

function renderMarkdownDetail(fileMeta, fileRecord) {
    if (!fileMeta) {
        return `
            <div class="empty-panel large">
                <i class="ph-bold ph-file-md"></i>
                <p>Select a Markdown file to preview and manage it.</p>
            </div>
        `;
    }

    return `
        <div class="detail-panel">
            <div class="panel-heading">
                <div>
                    <h3>${escHtml(fileMeta.title)}</h3>
                    <p>${escHtml(fileMeta.description || fileMeta.filename)}</p>
                </div>
                <div class="chip-row compact">
                    <button type="button" class="btn secondary-btn btn-small" data-action="download-markdown-file" data-markdown-id="${fileMeta.id}">
                        <i class="ph-bold ph-download-simple"></i> Download
                    </button>
                    <button type="button" class="btn secondary-btn btn-small" data-action="edit-markdown-file" data-markdown-id="${fileMeta.id}">
                        <i class="ph-bold ph-pencil-simple"></i> Edit
                    </button>
                </div>
            </div>

            <div class="chip-row">
                <span class="soft-chip">${escHtml(fileMeta.filename)}</span>
                <span class="soft-chip">${escHtml(`${fileMeta.size || 0} bytes`)}</span>
                ${(fileMeta.tags || []).map(tag => `<span class="soft-chip">${escHtml(tag)}</span>`).join('')}
            </div>

            <div class="detail-grid">
                <div class="doc-box">
                    <h4>Metadata</h4>
                    <pre>${escHtml(prettyJson({
        title: fileMeta.title,
        filename: fileMeta.filename,
        tags: fileMeta.tags || [],
        description: fileMeta.description || '',
        createdAt: fileMeta.createdAt,
        updatedAt: fileMeta.updatedAt,
    }))}</pre>
                </div>
                <div class="doc-box">
                    <h4>Excerpt</h4>
                    <pre>${escHtml(fileMeta.excerpt || 'No excerpt')}</pre>
                </div>
            </div>

            <div class="doc-box">
                <h4>Markdown Content</h4>
                <pre>${escHtml(fileRecord?.content || 'Loading content...')}</pre>
            </div>
        </div>
    `;
}

function renderMarkdownSection() {
    const visibleFiles = getVisibleMarkdownFiles();
    const selectedMeta = getSelectedMarkdownMeta();
    const selectedRecord = getSelectedMarkdownRecord();
    const selectedCount = state.markdown.selectedIds.length;
    const currentTag = state.markdown.activeFilter.startsWith('tag:') ? state.markdown.activeFilter.slice(4) : null;
    const stats = [
        { label: 'Files', value: state.data.markdownFiles.length },
        { label: 'Selected', value: selectedCount },
        { label: 'Tags', value: getMarkdownFilters().filter(filter => filter.key.startsWith('tag:')).length },
    ];

    return `
        ${renderStats(stats)}

        <div class="hero-card">
            <div class="hero-copy">
                <div class="hero-title-row">
                    <h2>Markdown Library</h2>
                    <span class="pill">${formatCount(visibleFiles.length, 'visible file', 'visible files')}</span>
                </div>
                <p>Import Markdown files, group them with tags, then export selected files or the current tag to a folder or ZIP.</p>
            </div>
            <div class="hero-actions">
                <button type="button" class="btn primary-btn" data-action="open-markdown-picker">
                    <i class="ph-bold ph-upload-simple"></i> Import Markdown
                </button>
                <button type="button" class="btn secondary-btn" data-action="select-visible-markdown" ${visibleFiles.length ? '' : 'disabled'}>
                    <i class="ph-bold ph-check-square"></i> Select Visible
                </button>
                <button type="button" class="btn secondary-btn" data-action="clear-markdown-selection" ${selectedCount ? '' : 'disabled'}>
                    <i class="ph-bold ph-x-square"></i> Clear
                </button>
                <button type="button" class="btn secondary-btn" data-action="export-selected-markdown" ${selectedCount ? '' : 'disabled'}>
                    <i class="ph-bold ph-download-simple"></i> Export Selected
                </button>
                <button type="button" class="btn secondary-btn" data-action="export-filtered-markdown" ${visibleFiles.length ? '' : 'disabled'}>
                    <i class="ph-bold ph-folder-open"></i> Export ${currentTag ? escHtml(currentTag) : 'Visible'}
                </button>
            </div>
        </div>

        <div class="prompt-layout">
            <section class="stack-panel">
                <div class="upload-zone" data-action="open-markdown-picker">
                    <i class="ph-bold ph-file-arrow-up"></i>
                    <strong>Drop Markdown files here or click to browse</strong>
                    <span class="muted">Multiple <code>.md</code> files are supported.</span>
                </div>

                ${visibleFiles.length
            ? `<div class="markdown-list">${visibleFiles.map(file => renderMarkdownListItem(file, file.id === selectedMeta?.id)).join('')}</div>`
            : `
                    <div class="empty-panel">
                        <i class="ph-bold ph-files"></i>
                        <p>${state.data.markdownFiles.length ? 'No markdown files match the current filter.' : 'Import Markdown files to start building the library.'}</p>
                    </div>
                `}
            </section>

            <section class="stack-panel">
                ${renderMarkdownDetail(selectedMeta, selectedRecord)}
            </section>
        </div>
    `;
}

function renderContent() {
    if (state.ui.loading) {
        dom.sectionContent.innerHTML = `
            <div class="loading-state">
                <div class="spinner"></div>
            </div>
        `;
        return;
    }

    dom.sectionContent.innerHTML = state.section === 'launcher'
        ? renderLauncherSection()
        : state.section === 'mcp'
            ? renderMcpSection()
            : state.section === 'prompts'
                ? renderPromptsSection()
                : renderMarkdownSection();
}

function renderCommandRow(command = {}) {
    return `
        <div class="row-list-item command-row">
            <input type="text" name="commandName" placeholder="Label" value="${escAttr(command.name || '')}">
            <input type="text" name="commandValue" placeholder="npm run dev" value="${escAttr(command.cmd || '')}">
            <button type="button" class="icon-btn danger" data-action="remove-row" title="Remove row">
                <i class="ph-bold ph-minus-circle"></i>
            </button>
        </div>
    `;
}

function renderKeyValueRow(entry = {}) {
    return `
        <div class="row-list-item">
            <input type="text" name="rowKey" placeholder="Key" value="${escAttr(entry.key || '')}">
            <input type="text" name="rowValue" placeholder="Value" value="${escAttr(entry.value || '')}">
            <button type="button" class="icon-btn danger" data-action="remove-row" title="Remove row">
                <i class="ph-bold ph-minus-circle"></i>
            </button>
        </div>
    `;
}

function renderValueRow(value = '', placeholder = 'Value') {
    return `
        <div class="row-list-item value-row">
            <input type="text" name="rowValueOnly" placeholder="${escAttr(placeholder)}" value="${escAttr(value)}">
            <button type="button" class="icon-btn danger" data-action="remove-row" title="Remove row">
                <i class="ph-bold ph-minus-circle"></i>
            </button>
        </div>
    `;
}

function renderMessageRow(message = {}) {
    return `
        <div class="message-row">
            <select name="messageRole">
                ${['system', 'user', 'assistant'].map(role => `<option value="${role}" ${message.role === role ? 'selected' : ''}>${role}</option>`).join('')}
            </select>
            <textarea name="messageContent" rows="4" placeholder="Message content">${escHtml(message.content || '')}</textarea>
            <button type="button" class="icon-btn danger" data-action="remove-row" title="Remove message">
                <i class="ph-bold ph-minus-circle"></i>
            </button>
        </div>
    `;
}

function renderProjectModal() {
    const record = state.ui.modal?.record || {};
    const categories = [...new Set(state.data.categories)].sort((left, right) => left.localeCompare(right));

    return `
        <div class="modal-overlay">
            <div class="modal modal-wide">
                <div class="modal-header">
                    <h2>${record.id ? 'Edit Project' : 'New Project'}</h2>
                    <button type="button" class="icon-btn" data-action="close-modal"><i class="ph-bold ph-x"></i></button>
                </div>

                <form id="projectForm" class="modal-body">
                    <div class="modal-grid">
                        <div class="stack-panel nested form-stack">
                            <label class="form-group">
                                <span>Project Name</span>
                                <input type="text" name="name" value="${escAttr(record.name || '')}" required>
                            </label>
                            <label class="form-group">
                                <span>Project Path</span>
                                <input type="text" name="path" value="${escAttr(record.path || '')}" placeholder="C:\\Users\\you\\Projects\\App" required>
                            </label>
                            <label class="form-group">
                                <span>Logo URL</span>
                                <input type="url" name="logo" value="${escAttr(record.logo || '')}" placeholder="https://...">
                            </label>
                            <label class="form-group">
                                <span>IDE Command</span>
                                <input type="text" name="ide" value="${escAttr(record.ide || 'code')}" placeholder="code, cursor, windsurf">
                            </label>
                            <label class="form-group">
                                <span>Notes</span>
                                <textarea name="notes" rows="5" placeholder="Project notes">${escHtml(record.notes || '')}</textarea>
                            </label>
                        </div>

                        <div class="stack-panel nested form-stack">
                            <div class="form-group">
                                <span>Categories</span>
                                <div class="selection-box">
                                    ${categories.length
            ? categories.map(category => `
                                            <label class="checkbox-field compact">
                                                <input type="checkbox" name="projectCategory" value="${escAttr(category)}" ${(record.categories || []).includes(category) ? 'checked' : ''}>
                                                <span>${escHtml(category)}</span>
                                            </label>
                                        `).join('')
            : '<p class="muted">No saved categories yet.</p>'}
                                </div>
                            </div>

                            <label class="form-group">
                                <span>Extra Categories</span>
                                <input type="text" name="extraCategories" placeholder="comma, separated, values">
                            </label>

                            <div class="form-group">
                                <div class="row-title">
                                    <span>Run Commands</span>
                                    <button type="button" class="text-btn" data-action="add-command-row">
                                        <i class="ph-bold ph-plus"></i> Add
                                    </button>
                                </div>
                                <div id="projectCommandsList" class="row-list">
                                    ${(record.commands || []).length ? (record.commands || []).map(renderCommandRow).join('') : renderCommandRow()}
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="modal-actions">
                        <button type="button" class="btn secondary-btn" data-action="close-modal">Cancel</button>
                        <button type="submit" class="btn primary-btn">
                            <i class="ph-bold ph-floppy-disk"></i> Save Project
                        </button>
                    </div>
                </form>
            </div>
        </div>
    `;
}

function renderMcpModal() {
    const record = state.ui.modal?.record || {};
    const transport = record.transport || 'streamable-http';

    return `
        <div class="modal-overlay">
            <div class="modal modal-wide">
                <div class="modal-header">
                    <h2>${record.id ? 'Edit MCP Server' : 'New MCP Server'}</h2>
                    <button type="button" class="icon-btn" data-action="close-modal"><i class="ph-bold ph-x"></i></button>
                </div>

                <form id="mcpForm" class="modal-body">
                    <div class="modal-grid">
                        <div class="stack-panel nested form-stack">
                            <label class="form-group">
                                <span>Name</span>
                                <input type="text" name="name" value="${escAttr(record.name || '')}" required>
                            </label>
                            <label class="form-group">
                                <span>Description</span>
                                <textarea name="description" rows="4" placeholder="What is this server for?">${escHtml(record.description || '')}</textarea>
                            </label>
                            <label class="form-group">
                                <span>Transport</span>
                                <select name="transport" id="mcpTransportSelect">
                                    <option value="streamable-http" ${transport === 'streamable-http' ? 'selected' : ''}>Streamable HTTP</option>
                                    <option value="sse" ${transport === 'sse' ? 'selected' : ''}>SSE</option>
                                    <option value="stdio" ${transport === 'stdio' ? 'selected' : ''}>stdio</option>
                                </select>
                            </label>
                            <label class="form-group">
                                <span>Timeout (ms)</span>
                                <input type="number" name="timeout" min="1" step="1000" value="${record.timeout || ''}" placeholder="Uses SDK default if blank">
                                <p class="field-help">Useful for slower stdio servers like <code>uvx</code> startup flows.</p>
                            </label>

                            <div class="transport-block ${transport === 'stdio' ? 'hidden' : ''}" data-transport-panel="remote">
                                <label class="form-group">
                                    <span>Server URL</span>
                                    <input type="url" name="url" value="${escAttr(record.url || '')}" placeholder="https://server.example/mcp">
                                </label>
                                <label class="form-group">
                                    <span>Bearer Token</span>
                                    <input type="password" name="bearerToken" value="${escAttr(record.bearerToken || '')}" placeholder="Optional">
                                </label>
                                <div class="form-group">
                                    <div class="row-title">
                                        <span>Custom Headers</span>
                                        <button type="button" class="text-btn" data-action="add-header-row">
                                            <i class="ph-bold ph-plus"></i> Add
                                        </button>
                                    </div>
                                    <div id="mcpHeadersList" class="row-list">
                                        ${(record.headers || []).length ? (record.headers || []).map(renderKeyValueRow).join('') : renderKeyValueRow()}
                                    </div>
                                </div>
                            </div>

                            <div class="transport-block ${transport === 'stdio' ? '' : 'hidden'}" data-transport-panel="stdio">
                                <label class="form-group">
                                    <span>Command</span>
                                    <input type="text" name="command" value="${escAttr(record.command || '')}" placeholder="node or uvx">
                                </label>
                                <label class="form-group">
                                    <span>Arguments (one per line)</span>
                                    <textarea name="args" rows="6" placeholder="server.js">${escHtml((record.args || []).join('\n'))}</textarea>
                                </label>
                                <label class="form-group">
                                    <span>Working Directory</span>
                                    <input type="text" name="cwd" value="${escAttr(record.cwd || '')}" placeholder="Optional">
                                </label>
                                <div class="form-group">
                                    <div class="row-title">
                                        <span>Environment Variables</span>
                                        <button type="button" class="text-btn" data-action="add-env-row">
                                            <i class="ph-bold ph-plus"></i> Add
                                        </button>
                                    </div>
                                    <div id="mcpEnvList" class="row-list">
                                        ${(record.env || []).length ? (record.env || []).map(renderKeyValueRow).join('') : renderKeyValueRow()}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div class="stack-panel nested form-stack">
                            <div class="form-group">
                                <div class="row-title">
                                    <span>Roots</span>
                                    <button type="button" class="text-btn" data-action="add-root-row">
                                        <i class="ph-bold ph-plus"></i> Add
                                    </button>
                                </div>
                                <div id="mcpRootsList" class="row-list">
                                    ${(record.roots || []).length ? (record.roots || []).map(root => renderValueRow(root, 'C:\\path\\to\\root')).join('') : renderValueRow('', 'C:\\path\\to\\root')}
                                </div>
                                <p class="field-help">Roots help project-aware MCP servers understand which folders matter.</p>
                            </div>

                            <label class="form-group">
                                <span>Notes</span>
                                <textarea name="notes" rows="7" placeholder="Optional setup notes">${escHtml(record.notes || '')}</textarea>
                            </label>

                            <div class="tip-box">
                                <h4>Supported First Version</h4>
                                <p>Streamable HTTP, SSE, and stdio are supported. Auth is handled with bearer tokens or custom headers.</p>
                            </div>
                        </div>
                    </div>

                    <div class="modal-actions">
                        <button type="button" class="btn secondary-btn" data-action="close-modal">Cancel</button>
                        <button type="submit" class="btn primary-btn">
                            <i class="ph-bold ph-floppy-disk"></i> Save Server
                        </button>
                    </div>
                </form>
            </div>
        </div>
    `;
}

function renderPromptModal() {
    const record = state.ui.modal?.record || {};
    const format = record.format || 'text';
    const exampleVariables = prettyJson(record.exampleVariables || {});

    return `
        <div class="modal-overlay">
            <div class="modal modal-wide">
                <div class="modal-header">
                    <h2>${record.id ? 'Edit Prompt' : 'New Prompt'}</h2>
                    <button type="button" class="icon-btn" data-action="close-modal"><i class="ph-bold ph-x"></i></button>
                </div>

                <form id="promptForm" class="modal-body">
                    <div class="modal-grid">
                        <div class="stack-panel nested form-stack">
                            <label class="form-group">
                                <span>Title</span>
                                <input type="text" name="title" value="${escAttr(record.title || '')}" required>
                            </label>
                            <label class="form-group">
                                <span>Description</span>
                                <textarea name="description" rows="4" placeholder="What is this prompt for?">${escHtml(record.description || '')}</textarea>
                            </label>
                            <label class="form-group">
                                <span>Tags</span>
                                <input type="text" name="tags" value="${escAttr((record.tags || []).join(', '))}" placeholder="support, sales, coding">
                            </label>
                            <label class="checkbox-field">
                                <input type="checkbox" name="favorite" ${record.favorite ? 'checked' : ''}>
                                <span>Favorite this prompt</span>
                            </label>
                            <label class="form-group">
                                <span>Format</span>
                                <select name="format" id="promptFormatSelect">
                                    <option value="text" ${format === 'text' ? 'selected' : ''}>Text</option>
                                    <option value="chat" ${format === 'chat' ? 'selected' : ''}>Chat</option>
                                </select>
                            </label>

                            <div class="${format === 'text' ? '' : 'hidden'}" data-prompt-panel="text">
                                <label class="form-group">
                                    <span>Template</span>
                                    <textarea name="template" rows="14" placeholder="Use {{variable}} placeholders">${escHtml(record.template || '')}</textarea>
                                    <p class="field-help">Use double curly braces like <code>{{customer_name}}</code> for reusable slots.</p>
                                </label>
                            </div>

                            <div class="${format === 'chat' ? '' : 'hidden'}" data-prompt-panel="chat">
                                <div class="form-group">
                                    <div class="row-title">
                                        <span>Messages</span>
                                        <button type="button" class="text-btn" data-action="add-message-row">
                                            <i class="ph-bold ph-plus"></i> Add
                                        </button>
                                    </div>
                                    <div id="promptMessagesList" class="message-list">
                                        ${(record.messages || []).length ? (record.messages || []).map(renderMessageRow).join('') : renderMessageRow({ role: 'system', content: '' })}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div class="stack-panel nested form-stack">
                            <label class="form-group">
                                <span>Example Variables (JSON)</span>
                                <textarea name="exampleVariables" rows="8" placeholder='{"customer_name":"Ava"}'>${escHtml(exampleVariables)}</textarea>
                            </label>
                            <label class="form-group">
                                <span>Example Output</span>
                                <textarea name="exampleOutput" rows="7" placeholder="Optional example response">${escHtml(record.exampleOutput || '')}</textarea>
                            </label>
                            <label class="form-group">
                                <span>Notes</span>
                                <textarea name="notes" rows="7" placeholder="Acceptance notes, usage tips, caveats">${escHtml(record.notes || '')}</textarea>
                            </label>

                            <div class="tip-box">
                                <h4>Recommended Pattern</h4>
                                <p>Save realistic example variables so the rendered preview stays useful when you revisit the prompt later.</p>
                            </div>
                        </div>
                    </div>

                    <div class="modal-actions">
                        <button type="button" class="btn secondary-btn" data-action="close-modal">Cancel</button>
                        <button type="submit" class="btn primary-btn">
                            <i class="ph-bold ph-floppy-disk"></i> Save Prompt
                        </button>
                    </div>
                </form>
            </div>
        </div>
    `;
}

function renderMarkdownModal() {
    const record = state.ui.modal?.record || {};

    return `
        <div class="modal-overlay">
            <div class="modal modal-wide">
                <div class="modal-header">
                    <h2>Edit Markdown File</h2>
                    <button type="button" class="icon-btn" data-action="close-modal"><i class="ph-bold ph-x"></i></button>
                </div>

                <form id="markdownForm" class="modal-body">
                    <div class="modal-grid">
                        <div class="stack-panel nested form-stack">
                            <label class="form-group">
                                <span>Title</span>
                                <input type="text" name="title" value="${escAttr(record.title || '')}" required>
                            </label>
                            <label class="form-group">
                                <span>Filename</span>
                                <input type="text" name="filename" value="${escAttr(record.filename || '')}" required>
                            </label>
                            <label class="form-group">
                                <span>Tags</span>
                                <input type="text" name="tags" value="${escAttr((record.tags || []).join(', '))}" placeholder="notes, prompt, api">
                            </label>
                            <label class="form-group">
                                <span>Description</span>
                                <textarea name="description" rows="6" placeholder="Optional summary">${escHtml(record.description || '')}</textarea>
                            </label>
                        </div>

                        <div class="stack-panel nested form-stack">
                            <label class="form-group">
                                <span>Markdown Content</span>
                                <textarea name="content" rows="18" placeholder="# Title">${escHtml(record.content || '')}</textarea>
                            </label>
                        </div>
                    </div>

                    <div class="modal-actions">
                        <button type="button" class="btn secondary-btn" data-action="close-modal">Cancel</button>
                        <button type="submit" class="btn primary-btn">
                            <i class="ph-bold ph-floppy-disk"></i> Save Markdown
                        </button>
                    </div>
                </form>
            </div>
        </div>
    `;
}

function renderModal() {
    if (!state.ui.modal) {
        dom.modalRoot.innerHTML = '';
        return;
    }

    dom.modalRoot.innerHTML = state.ui.modal.type === 'project'
        ? renderProjectModal()
        : state.ui.modal.type === 'mcp'
            ? renderMcpModal()
            : state.ui.modal.type === 'prompt'
                ? renderPromptModal()
                : renderMarkdownModal();

    updateDynamicModalPanels();
}

function updateDynamicModalPanels() {
    const transportSelect = document.getElementById('mcpTransportSelect');
    if (transportSelect) {
        const isStdio = transportSelect.value === 'stdio';
        document.querySelectorAll('[data-transport-panel="remote"]').forEach(panel => panel.classList.toggle('hidden', isStdio));
        document.querySelectorAll('[data-transport-panel="stdio"]').forEach(panel => panel.classList.toggle('hidden', !isStdio));
    }

    const promptFormatSelect = document.getElementById('promptFormatSelect');
    if (promptFormatSelect) {
        const isChat = promptFormatSelect.value === 'chat';
        document.querySelectorAll('[data-prompt-panel="text"]').forEach(panel => panel.classList.toggle('hidden', isChat));
        document.querySelectorAll('[data-prompt-panel="chat"]').forEach(panel => panel.classList.toggle('hidden', !isChat));
    }
}

function renderApp() {
    syncSelections();
    renderSectionNav();
    renderSidebar();
    renderHeader();
    renderContent();
    renderModal();
    setupProjectDragDrop();
    setupMarkdownUploadZone();
}

function openModal(type, record = null) {
    state.ui.modal = {
        type,
        record: record ? JSON.parse(JSON.stringify(record)) : null,
    };
    renderApp();
}

function closeModal() {
    state.ui.modal = null;
    renderApp();
}

async function ensureMarkdownRecord(id, force = false) {
    if (!id) return null;
    if (!force && state.markdown.records[id]) return state.markdown.records[id];

    const record = await api.getMarkdownFile(id);
    state.markdown.records[id] = record;
    return record;
}

async function hydrateSelectedMarkdownRecord(force = false) {
    if (!state.markdown.selectedId) return;

    try {
        await ensureMarkdownRecord(state.markdown.selectedId, force);
    } catch (error) {
        showToast(error.message || 'Failed to load markdown file.', 'error');
    }
}

function buildUniqueClientFilename(filename, used) {
    const safe = sanitizeClientFilename(filename);
    if (!used.has(safe)) {
        used.set(safe, 1);
        return safe;
    }
    const next = used.get(safe) + 1;
    used.set(safe, next);
    const base = safe.replace(/\.md$/i, '');
    return `${base} (${next}).md`;
}

async function writeMarkdownFilesToDirectory(records) {
    const directoryHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
    const usedNames = new Map();

    for (const record of records) {
        const filename = buildUniqueClientFilename(record.filename, usedNames);
        const fileHandle = await directoryHandle.getFileHandle(filename, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(record.content || '');
        await writable.close();
    }
}

async function exportMarkdownIds(ids) {
    if (!ids.length) return;
    const records = await api.getMarkdownFilesBatch(ids);

    if ('showDirectoryPicker' in window) {
        try {
            await writeMarkdownFilesToDirectory(records);
            showToast(`Exported ${records.length} markdown file${records.length === 1 ? '' : 's'} to the selected folder.`, 'success');
            return;
        } catch (error) {
            if (error?.name === 'AbortError') return;
        }
    }

    const zip = await api.exportMarkdownZip(ids);
    downloadBlob(zip, `markdown-library-${Date.now()}.zip`);
    showToast(`Downloaded ${records.length} markdown file${records.length === 1 ? '' : 's'} as ZIP.`, 'success');
}

async function downloadSingleMarkdown(id) {
    const record = await ensureMarkdownRecord(id);
    const blob = new Blob([record.content || ''], { type: 'text/markdown;charset=utf-8' });
    downloadBlob(blob, sanitizeClientFilename(record.filename || `${record.title || 'document'}.md`));
}

async function importMarkdownFileList(fileList) {
    const files = [...fileList].filter(file => file.name.toLowerCase().endsWith('.md'));
    if (!files.length) {
        showToast('Select one or more .md files.', 'error');
        return;
    }

    const payloadFiles = await Promise.all(files.map(async file => ({
        name: file.name,
        content: await file.text(),
    })));

    const imported = await api.importMarkdownFiles({ files: payloadFiles });
    if (dom.markdownUploadInput) dom.markdownUploadInput.value = '';
    if (imported.length) {
        state.markdown.activeFilter = 'All';
        state.markdown.selectedId = imported[0].id;
        state.markdown.selectedIds = imported.map(file => file.id);
    }
    showToast(`Imported ${imported.length} markdown file${imported.length === 1 ? '' : 's'}.`, 'success');
    await loadData();
    if (imported[0]?.id) {
        await ensureMarkdownRecord(imported[0].id);
        renderApp();
    }
}

function refreshToolDraftRaw(serverId, toolName) {
    const server = state.data.mcpServers.find(item => item.id === serverId);
    const tool = (server?.tools || []).find(item => item.name === toolName);
    if (!tool) return;

    const draft = ensureToolDraft(serverId, tool);
    const compact = {};
    Object.entries(draft.values || {}).forEach(([key, value]) => {
        if (value === '' || value === undefined || value === null) return;
        compact[key] = value;
    });
    draft.rawText = prettyJson(compact);
}

function readRows(container) {
    return [...container.querySelectorAll('.row-list-item')];
}

function readKeyValueRows(container) {
    return readRows(container)
        .map(row => ({
            key: row.querySelector('[name="rowKey"]')?.value.trim() || '',
            value: row.querySelector('[name="rowValue"]')?.value || '',
        }))
        .filter(entry => entry.key);
}

function readValueRows(container) {
    return readRows(container)
        .map(row => row.querySelector('[name="rowValueOnly"]')?.value.trim() || '')
        .filter(Boolean);
}

function parseLineArray(value) {
    return value
        .split(/\r?\n/)
        .map(item => item.trim())
        .filter(Boolean);
}

async function loadData({ initial = false } = {}) {
    if (initial) {
        state.ui.loading = true;
        renderContent();
    }

    try {
        state.data = await api.bootstrap();
        syncSelections();
        state.ui.loading = false;
        renderApp();
        if (state.section === 'markdown' && state.markdown.selectedId) {
            await hydrateSelectedMarkdownRecord();
            renderApp();
        }
    } catch (error) {
        state.ui.loading = false;
        dom.sectionContent.innerHTML = `
            <div class="empty-state">
                <i class="ph-bold ph-warning-circle"></i>
                <h2>Could not load the app</h2>
                <p>${escHtml(error.message || 'Server unavailable')}</p>
            </div>
        `;
    } finally {
        state.ui.loading = false;
    }
}

async function handlePrimaryAction() {
    if (state.section === 'launcher') return openModal('project');
    if (state.section === 'mcp') return openModal('mcp');
    if (state.section === 'prompts') return openModal('prompt');
    dom.markdownUploadInput?.click();
}

async function handleAction(action, trigger) {
    switch (action) {
        case 'switch-section':
            state.section = trigger.dataset.section;
            renderApp();
            if (state.section === 'markdown' && state.markdown.selectedId) {
                await hydrateSelectedMarkdownRecord();
                renderApp();
            }
            return;

        case 'select-category':
            state.launcher.activeCategory = trigger.dataset.category;
            renderApp();
            return;

        case 'delete-category': {
            const category = trigger.dataset.category;
            if (!confirm(`Delete workspace "${category}"? It will be removed from all projects.`)) return;
            await api.deleteCategory(category);
            if (state.launcher.activeCategory === category) state.launcher.activeCategory = 'All';
            showToast(`Workspace "${category}" deleted.`, 'info');
            await loadData();
            return;
        }

        case 'edit-project': {
            const project = state.data.projects.find(item => item.id === trigger.dataset.projectId);
            if (project) openModal('project', project);
            return;
        }

        case 'delete-project': {
            const project = state.data.projects.find(item => item.id === trigger.dataset.projectId);
            if (!project) return;
            if (!confirm(`Delete "${project.name}"? This cannot be undone.`)) return;
            await api.deleteProject(project.id);
            showToast(`"${project.name}" removed.`, 'info');
            await loadData();
            return;
        }

        case 'toggle-project-pin': {
            const project = state.data.projects.find(item => item.id === trigger.dataset.projectId);
            if (!project) return;
            await api.updateProject(project.id, { ...project, pinned: !project.pinned });
            showToast(project.pinned ? 'Project unpinned.' : 'Project pinned.', 'success');
            await loadData();
            return;
        }

        case 'execute-project-command': {
            const projectId = trigger.dataset.projectId;
            const commandIndex = Number(trigger.dataset.commandIndex);
            const key = `${projectId}:${commandIndex}`;
            state.runningCommands[key] = true;
            renderApp();
            try {
                await api.executeProjectCommand(projectId, commandIndex);
                showToast('Command launched.', 'success');
            } catch (error) {
                delete state.runningCommands[key];
                renderApp();
                showToast(error.message || 'Failed to launch command.', 'error');
            }
            return;
        }

        case 'stop-project-command': {
            const projectId = trigger.dataset.projectId;
            const commandIndex = Number(trigger.dataset.commandIndex);
            const commandName = trigger.dataset.commandName;
            const key = `${projectId}:${commandIndex}`;
            try {
                await api.stopProjectCommand(projectId, commandIndex, commandName);
                delete state.runningCommands[key];
                renderApp();
                showToast(`Stopped "${commandName}".`, 'info');
            } catch (error) {
                showToast(error.message || 'Failed to stop command.', 'error');
            }
            return;
        }

        case 'open-project-ide':
            await api.openProjectIde(trigger.dataset.projectId);
            showToast('Opened in IDE.', 'success');
            return;

        case 'select-server':
            state.mcp.selectedServerId = trigger.dataset.serverId;
            state.mcp.selectedToolName = getSelectedServer()?.tools?.[0]?.name || null;
            renderApp();
            return;

        case 'discover-server': {
            try {
                const server = await api.discoverMcpServer(trigger.dataset.serverId);
                state.data.mcpServers = state.data.mcpServers.map(item => item.id === server.id ? server : item);
                state.mcp.selectedServerId = server.id;
                state.mcp.selectedToolName = server.tools?.[0]?.name || state.mcp.selectedToolName;
                showToast(`Loaded ${server.tools?.length || 0} tools from ${server.name}.`, 'success');
                renderApp();
            } catch (error) {
                showToast(error.message || 'Failed to discover server.', 'error');
                await loadData();
            }
            return;
        }

        case 'edit-server': {
            const server = state.data.mcpServers.find(item => item.id === trigger.dataset.serverId);
            if (server) openModal('mcp', server);
            return;
        }

        case 'delete-server': {
            const server = state.data.mcpServers.find(item => item.id === trigger.dataset.serverId);
            if (!server) return;
            if (!confirm(`Delete MCP server "${server.name}"?`)) return;
            await api.deleteMcpServer(server.id);
            showToast(`"${server.name}" deleted.`, 'info');
            await loadData();
            return;
        }

        case 'select-tool':
            state.mcp.selectedToolName = trigger.dataset.toolName;
            if (state.mcp.selectedServerId && getSelectedTool()) {
                ensureToolDraft(state.mcp.selectedServerId, getSelectedTool());
            }
            renderApp();
            return;

        case 'set-tool-mode': {
            const nextMode = trigger.dataset.mode;
            const server = getSelectedServer();
            const tool = getSelectedTool(server);
            if (!server || !tool) return;
            const draft = ensureToolDraft(server.id, tool);
            if (nextMode === 'json') {
                refreshToolDraftRaw(server.id, tool.name);
            } else {
                const parsed = tryParseJson(draft.rawText, {});
                if (!parsed.error && parsed.value && typeof parsed.value === 'object' && !Array.isArray(parsed.value)) {
                    draft.values = parsed.value;
                }
            }
            state.mcp.inputMode = nextMode;
            renderApp();
            return;
        }

        case 'apply-history-payload': {
            const server = getSelectedServer();
            const historyEntry = (server?.history || []).find(entry => entry.id === trigger.dataset.historyId);
            const toolName = trigger.dataset.toolName;
            const tool = (server?.tools || []).find(item => item.name === toolName);
            if (!server || !historyEntry || !tool) return;
            const draft = ensureToolDraft(server.id, tool);
            draft.values = historyEntry.arguments || {};
            draft.jsonFields = {};
            draft.rawText = prettyJson(historyEntry.arguments || {});
            state.mcp.selectedToolName = toolName;
            state.mcp.inputMode = 'form';
            renderApp();
            return;
        }

        case 'select-prompt-filter':
            state.prompts.activeFilter = trigger.dataset.filter;
            renderApp();
            return;

        case 'select-prompt':
            state.prompts.selectedPromptId = trigger.dataset.promptId;
            renderApp();
            return;

        case 'edit-prompt': {
            const prompt = state.data.prompts.find(item => item.id === trigger.dataset.promptId);
            if (prompt) openModal('prompt', prompt);
            return;
        }

        case 'delete-prompt': {
            const prompt = state.data.prompts.find(item => item.id === trigger.dataset.promptId);
            if (!prompt) return;
            if (!confirm(`Delete prompt "${prompt.title}"?`)) return;
            await api.deletePrompt(prompt.id);
            showToast(`"${prompt.title}" deleted.`, 'info');
            await loadData();
            return;
        }

        case 'duplicate-prompt': {
            const duplicated = await api.duplicatePrompt(trigger.dataset.promptId);
            state.prompts.selectedPromptId = duplicated.id;
            showToast('Prompt duplicated.', 'success');
            await loadData();
            return;
        }

        case 'toggle-prompt-favorite': {
            const prompt = state.data.prompts.find(item => item.id === trigger.dataset.promptId);
            if (!prompt) return;
            await api.updatePrompt(prompt.id, { ...prompt, favorite: !prompt.favorite });
            showToast(prompt.favorite ? 'Removed from favorites.' : 'Added to favorites.', 'success');
            await loadData();
            return;
        }

        case 'copy-prompt-template': {
            const prompt = state.data.prompts.find(item => item.id === trigger.dataset.promptId);
            if (!prompt) return;
            await copyText(getPromptTemplateText(prompt));
            showToast('Template copied.', 'success');
            return;
        }

        case 'copy-prompt-rendered': {
            const prompt = state.data.prompts.find(item => item.id === trigger.dataset.promptId);
            if (!prompt) return;
            await copyText(renderPromptPreview(prompt));
            showToast('Rendered prompt copied.', 'success');
            return;
        }

        case 'open-markdown-picker':
            dom.markdownUploadInput?.click();
            return;

        case 'select-markdown-filter':
            state.markdown.activeFilter = trigger.dataset.filter;
            renderApp();
            await hydrateSelectedMarkdownRecord();
            renderApp();
            return;

        case 'select-markdown-file':
            state.markdown.selectedId = trigger.dataset.markdownId;
            renderApp();
            await hydrateSelectedMarkdownRecord();
            renderApp();
            return;

        case 'toggle-markdown-selection': {
            const markdownId = trigger.dataset.markdownId;
            const selected = new Set(state.markdown.selectedIds);
            const shouldSelect = 'checked' in trigger ? trigger.checked : !selected.has(markdownId);
            if (shouldSelect) selected.add(markdownId); else selected.delete(markdownId);
            state.markdown.selectedIds = [...selected];
            renderApp();
            return;
        }

        case 'select-visible-markdown':
            state.markdown.selectedIds = getVisibleMarkdownFiles().map(file => file.id);
            renderApp();
            return;

        case 'clear-markdown-selection':
            state.markdown.selectedIds = [];
            renderApp();
            return;

        case 'export-selected-markdown':
            await exportMarkdownIds(state.markdown.selectedIds);
            return;

        case 'export-filtered-markdown':
            await exportMarkdownIds(getVisibleMarkdownFiles().map(file => file.id));
            return;

        case 'download-markdown-file':
            await downloadSingleMarkdown(trigger.dataset.markdownId);
            showToast('Markdown file downloaded.', 'success');
            return;

        case 'edit-markdown-file': {
            const record = await ensureMarkdownRecord(trigger.dataset.markdownId);
            if (record) openModal('markdown', record);
            return;
        }

        case 'delete-markdown-file': {
            const file = state.data.markdownFiles.find(item => item.id === trigger.dataset.markdownId);
            if (!file) return;
            if (!confirm(`Delete "${file.title}" from the markdown library?`)) return;
            await api.deleteMarkdownFile(file.id);
            delete state.markdown.records[file.id];
            state.markdown.selectedIds = state.markdown.selectedIds.filter(id => id !== file.id);
            if (state.markdown.selectedId === file.id) state.markdown.selectedId = null;
            showToast(`"${file.title}" deleted.`, 'info');
            await loadData();
            return;
        }

        case 'add-command-row':
            document.getElementById('projectCommandsList')?.insertAdjacentHTML('beforeend', renderCommandRow());
            return;
        case 'add-header-row':
            document.getElementById('mcpHeadersList')?.insertAdjacentHTML('beforeend', renderKeyValueRow());
            return;
        case 'add-env-row':
            document.getElementById('mcpEnvList')?.insertAdjacentHTML('beforeend', renderKeyValueRow());
            return;
        case 'add-root-row':
            document.getElementById('mcpRootsList')?.insertAdjacentHTML('beforeend', renderValueRow('', 'C:\\path\\to\\root'));
            return;
        case 'add-message-row':
            document.getElementById('promptMessagesList')?.insertAdjacentHTML('beforeend', renderMessageRow({ role: 'user', content: '' }));
            return;
        case 'remove-row':
            trigger.closest('.row-list-item, .message-row')?.remove();
            return;
        case 'close-modal':
            closeModal();
            return;
        default:
            return;
    }
}

async function handleFormSubmit(event) {
    const { target } = event;
    if (!(target instanceof HTMLFormElement)) return;
    event.preventDefault();

    if (target.id === 'categoryForm') {
        const name = String(new FormData(target).get('name') || '').trim();
        if (!name) return;
        await api.createCategory(name);
        state.launcher.newCategoryOpen = false;
        showToast(`Workspace "${name}" created.`, 'success');
        await loadData();
        return;
    }

    if (target.id === 'projectForm') {
        const record = state.ui.modal?.record || {};
        const selectedCategories = [...target.querySelectorAll('input[name="projectCategory"]:checked')].map(input => input.value);
        const commands = [...target.querySelectorAll('.command-row')].map(row => ({
            name: row.querySelector('[name="commandName"]')?.value.trim() || '',
            cmd: row.querySelector('[name="commandValue"]')?.value.trim() || '',
        })).filter(command => command.name && command.cmd);

        const body = {
            name: target.elements.name.value.trim(),
            path: target.elements.path.value.trim(),
            logo: target.elements.logo.value.trim(),
            ide: target.elements.ide.value.trim(),
            notes: target.elements.notes.value.trim(),
            categories: [...new Set([...selectedCategories, ...parseTagsInput(target.elements.extraCategories.value)])],
            commands,
            pinned: Boolean(record.pinned),
        };

        if (record.id) await api.updateProject(record.id, body); else await api.createProject(body);
        closeModal();
        showToast(record.id ? 'Project updated.' : 'Project created.', 'success');
        await loadData();
        return;
    }

    if (target.id === 'mcpForm') {
        const record = state.ui.modal?.record || {};
        const body = {
            name: target.elements.name.value.trim(),
            description: target.elements.description.value.trim(),
            transport: target.elements.transport.value,
            url: target.elements.url?.value.trim() || '',
            bearerToken: target.elements.bearerToken?.value.trim() || '',
            command: target.elements.command?.value.trim() || '',
            args: parseLineArray(target.elements.args?.value || ''),
            cwd: target.elements.cwd?.value.trim() || '',
            timeout: (() => {
                const raw = target.elements.timeout?.value?.trim() || '';
                if (!raw) return null;
                const parsed = Number.parseInt(raw, 10);
                return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
            })(),
            headers: readKeyValueRows(document.getElementById('mcpHeadersList') || document.createElement('div')),
            env: readKeyValueRows(document.getElementById('mcpEnvList') || document.createElement('div')),
            roots: readValueRows(document.getElementById('mcpRootsList') || document.createElement('div')),
            notes: target.elements.notes.value.trim(),
        };

        if (record.id) await api.updateMcpServer(record.id, body); else await api.createMcpServer(body);
        closeModal();
        showToast(record.id ? 'Server updated.' : 'Server created.', 'success');
        await loadData();
        return;
    }

    if (target.id === 'promptForm') {
        const record = state.ui.modal?.record || {};
        const parsedVariables = tryParseJson(target.elements.exampleVariables.value || '{}', {});
        if (parsedVariables.error || typeof parsedVariables.value !== 'object' || Array.isArray(parsedVariables.value)) {
            showToast('Example variables must be a valid JSON object.', 'error');
            return;
        }

        const format = target.elements.format.value;
        const messages = [...target.querySelectorAll('.message-row')].map(row => ({
            role: row.querySelector('[name="messageRole"]')?.value || 'user',
            content: row.querySelector('[name="messageContent"]')?.value.trim() || '',
        })).filter(message => message.content);

        const body = {
            title: target.elements.title.value.trim(),
            description: target.elements.description.value.trim(),
            tags: parseTagsInput(target.elements.tags.value),
            favorite: target.elements.favorite.checked,
            format,
            template: format === 'text' ? target.elements.template.value : '',
            messages: format === 'chat' ? messages : [],
            exampleVariables: parsedVariables.value,
            exampleOutput: target.elements.exampleOutput.value.trim(),
            notes: target.elements.notes.value.trim(),
        };

        if (record.id) await api.updatePrompt(record.id, body); else await api.createPrompt(body);
        closeModal();
        showToast(record.id ? 'Prompt updated.' : 'Prompt created.', 'success');
        await loadData();
        return;
    }

    if (target.id === 'toolRunForm') {
        const server = getSelectedServer();
        const tool = getSelectedTool(server);
        if (!server || !tool) return;

        let args = {};
        if (state.mcp.inputMode === 'json' || !tool.inputSchema?.properties) {
            const rawText = target.elements.toolRawJson?.value?.trim() || '{}';
            const parsed = tryParseJson(rawText, {});
            if (parsed.error || typeof parsed.value !== 'object' || parsed.value === null || Array.isArray(parsed.value)) {
                showToast('Arguments JSON must be a valid object.', 'error');
                return;
            }
            args = parsed.value;
            const draft = ensureToolDraft(server.id, tool);
            draft.rawText = rawText;
            draft.values = parsed.value;
            draft.jsonFields = {};
        } else {
            const nextArgs = {};
            for (const [propertyName, schema] of Object.entries(tool.inputSchema?.properties || {})) {
                const field = target.querySelector(`[data-tool-field="${CSS.escape(propertyName)}"]`);
                if (!field) continue;
                if (schema.type === 'boolean') {
                    nextArgs[propertyName] = field.checked;
                } else if (schema.type === 'object' || schema.type === 'array') {
                    const raw = field.value.trim();
                    if (!raw) continue;
                    const parsed = tryParseJson(raw);
                    if (parsed.error) throw new Error(`Field "${propertyName}" must be valid JSON.`);
                    nextArgs[propertyName] = parsed.value;
                } else if (schema.type === 'number' || schema.type === 'integer') {
                    const raw = field.value.trim();
                    if (!raw) continue;
                    const value = schema.type === 'integer' ? Number.parseInt(raw, 10) : Number.parseFloat(raw);
                    if (Number.isNaN(value)) throw new Error(`Field "${propertyName}" must be a valid number.`);
                    nextArgs[propertyName] = value;
                } else if (field.value !== '') {
                    nextArgs[propertyName] = field.value;
                }
            }
            args = nextArgs;
            const draft = ensureToolDraft(server.id, tool);
            draft.values = nextArgs;
            draft.jsonFields = {};
            draft.rawText = prettyJson(nextArgs);
        }

        try {
            const response = await api.invokeMcpTool(server.id, tool.name, args);
            state.mcp.lastRun = { ...response, serverId: server.id, toolName: tool.name, executedAt: new Date().toISOString() };
            state.data.mcpServers = state.data.mcpServers.map(item => item.id === server.id
                ? { ...item, history: response.history || item.history, lastStatus: 'online', lastCheckedAt: state.mcp.lastRun.executedAt }
                : item);
            renderApp();
            showToast(response.isError ? 'Tool returned an error result.' : 'Tool executed.', response.isError ? 'info' : 'success');
        } catch (error) {
            showToast(error.message || 'Tool invocation failed.', 'error');
            await loadData();
        }
        return;
    }

    if (target.id === 'markdownForm') {
        const record = state.ui.modal?.record || {};
        if (!record.id) return;

        const body = {
            title: target.elements.title.value.trim(),
            filename: target.elements.filename.value.trim(),
            tags: parseTagsInput(target.elements.tags.value),
            description: target.elements.description.value.trim(),
            content: target.elements.content.value,
        };

        const updated = await api.updateMarkdownFile(record.id, body);
        state.markdown.records[record.id] = {
            ...record,
            ...updated,
            content: body.content,
        };
        state.markdown.selectedId = record.id;
        closeModal();
        showToast('Markdown file updated.', 'success');
        await loadData();
        await hydrateSelectedMarkdownRecord(true);
        renderApp();
    }
}

function setupProjectDragDrop() {
    if (state.section !== 'launcher') return;
    if (!(state.launcher.activeCategory === 'All' && !getSearchValue().trim())) return;

    dom.sectionContent.querySelectorAll('.project-card[draggable="true"]').forEach(card => {
        card.addEventListener('dragstart', event => {
            if (event.target.closest('button')) {
                event.preventDefault();
                return;
            }
            dragProjectId = card.dataset.projectId;
            event.dataTransfer.effectAllowed = 'move';
            setTimeout(() => card.classList.add('dragging'), 0);
        });
        card.addEventListener('dragend', () => {
            card.classList.remove('dragging');
            dom.sectionContent.querySelectorAll('.project-card').forEach(item => item.classList.remove('drag-over'));
            dragProjectId = null;
        });
        card.addEventListener('dragover', event => {
            event.preventDefault();
            if (card.dataset.projectId !== dragProjectId) card.classList.add('drag-over');
        });
        card.addEventListener('dragleave', event => {
            if (!card.contains(event.relatedTarget)) card.classList.remove('drag-over');
        });
        card.addEventListener('drop', async event => {
            event.preventDefault();
            card.classList.remove('drag-over');
            const targetId = card.dataset.projectId;
            if (!dragProjectId || dragProjectId === targetId) return;
            const sourceIndex = state.data.projects.findIndex(project => project.id === dragProjectId);
            const targetIndex = state.data.projects.findIndex(project => project.id === targetId);
            if (sourceIndex === -1 || targetIndex === -1) return;
            const [moved] = state.data.projects.splice(sourceIndex, 1);
            state.data.projects.splice(targetIndex, 0, moved);
            renderApp();
            try {
                await api.reorderProjects(state.data.projects.map(project => project.id));
            } catch (error) {
                showToast(error.message || 'Failed to reorder projects.', 'error');
                await loadData();
            }
        });
    });
}

function setupMarkdownUploadZone() {
    if (state.section !== 'markdown') return;

    const uploadZone = dom.sectionContent.querySelector('.upload-zone');
    if (!uploadZone) return;

    const activate = event => {
        event.preventDefault();
        uploadZone.classList.add('drag-active');
    };

    const deactivate = event => {
        event.preventDefault();
        if (event.type === 'dragleave' && uploadZone.contains(event.relatedTarget)) return;
        uploadZone.classList.remove('drag-active');
    };

    uploadZone.addEventListener('dragenter', activate);
    uploadZone.addEventListener('dragover', activate);
    uploadZone.addEventListener('dragleave', deactivate);
    uploadZone.addEventListener('drop', async event => {
        deactivate(event);
        const files = event.dataTransfer?.files;
        if (!files?.length) return;

        try {
            await importMarkdownFileList(files);
        } catch (error) {
            showToast(error.message || 'Markdown import failed.', 'error');
        }
    });
}

dom.themeToggleBtn.addEventListener('click', () => {
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
    applyTheme(currentTheme === 'dark' ? 'light' : 'dark');
});

dom.primaryActionBtn.addEventListener('click', handlePrimaryAction);
dom.sidebarActionBtn.addEventListener('click', () => {
    state.launcher.newCategoryOpen = !state.launcher.newCategoryOpen;
    renderApp();
});

document.addEventListener('click', async event => {
    const trigger = event.target.closest('[data-action]');
    if (!trigger) return;
    try {
        await handleAction(trigger.dataset.action, trigger);
    } catch (error) {
        showToast(error.message || 'Action failed.', 'error');
    }
});

document.addEventListener('submit', async event => {
    try {
        await handleFormSubmit(event);
    } catch (error) {
        showToast(error.message || 'Save failed.', 'error');
    }
});

document.addEventListener('input', event => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    if (target.id === 'globalSearch') {
        setSearchValue(target.value);
        renderApp();
        return;
    }

    if (target.closest('#toolRunForm')) {
        const server = getSelectedServer();
        const tool = getSelectedTool(server);
        if (!server || !tool) return;
        const draft = ensureToolDraft(server.id, tool);

        if (target.name === 'toolRawJson') {
            draft.rawText = target.value;
            return;
        }

        const fieldName = target.dataset.toolField;
        if (!fieldName) return;
        if (target.dataset.jsonField === 'true') {
            draft.jsonFields[fieldName] = target.value;
            const parsed = tryParseJson(target.value);
            if (!parsed.error) draft.values[fieldName] = parsed.value;
            refreshToolDraftRaw(server.id, tool.name);
            return;
        }

        draft.values[fieldName] = target.type === 'checkbox' ? target.checked : target.value;
        refreshToolDraftRaw(server.id, tool.name);
        return;
    }

    if (target.closest('#mcpForm') || target.closest('#promptForm')) {
        updateDynamicModalPanels();
    }
});

document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && state.ui.modal) closeModal();
});

dom.modalRoot.addEventListener('click', event => {
    if (event.target === dom.modalRoot.querySelector('.modal-overlay')) closeModal();
});

dom.markdownUploadInput?.addEventListener('change', async event => {
    const files = event.target.files;
    if (!files?.length) return;

    try {
        await importMarkdownFileList(files);
    } catch (error) {
        showToast(error.message || 'Markdown import failed.', 'error');
    }
});

loadData({ initial: true });
