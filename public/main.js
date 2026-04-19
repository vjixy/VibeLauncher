import { state, bootstrap, subscribe, refreshRunning, applySettingsToDocument } from './state.js';
import { api } from './api.js';
import { toast } from './ui.js';
import { renderDashboard } from './views/dashboard.js';
import { renderLauncher, openProjectDrawer } from './views/launcher.js';
import { openProjectModal } from './views/project-modal.js';
import { renderMcp, openMcpModal } from './views/mcp.js';
import { renderPrompts, openPromptModal } from './views/prompts.js';
import { renderMarkdown, triggerMarkdownImport } from './views/markdown.js';
import { renderSettings } from './views/settings.js';
import { openPalette } from './views/palette.js';

const ctx = {
  navigate,
  refresh: doRefresh,
  onPalette: () => openPalette(ctx),
  emit: handleEmit,
  openProject: (id) => openProjectDrawer(id, ctx),
  runCommand,
  stopCommand,
  toggleTheme,
};

async function init() {
  try {
    await bootstrap();
    applySettingsToDocument();
    // Start on user's configured section (unless deep-linked via hash)
    const hash = (location.hash || '').replace('#', '');
    state.section = hash && ['dashboard', 'launcher', 'mcp', 'prompts', 'markdown', 'settings'].includes(hash)
      ? hash
      : (state.settings.startupSection || 'dashboard');
    render();
    attachGlobalShortcuts();
    attachSystemThemeListener();
    startPolling();
    attachGlobalDropzone();
  } catch (err) {
    console.error(err);
    toast(err.message || 'Failed to boot', { type: 'error' });
  }
}

function navigate(section) {
  state.section = section;
  location.hash = section;
  render();
}

async function doRefresh() {
  try {
    const data = await api.bootstrap();
    state.categories = data.categories || [];
    state.projects = data.projects || [];
    state.mcpServers = data.mcpServers || [];
    state.prompts = data.prompts || [];
    state.markdownFiles = data.markdownFiles || [];
    state.running = data.running || [];
    state.activity = data.activity || [];
    state.settings = { ...state.settings, ...(data.settings || {}) };
    applySettingsToDocument();
    render();
  } catch (err) {
    console.error(err);
  }
}

function render() {
  switch (state.section) {
    case 'dashboard': renderDashboard(ctx); break;
    case 'launcher':  renderLauncher(ctx); break;
    case 'mcp':       renderMcp(ctx); break;
    case 'prompts':   renderPrompts(ctx); break;
    case 'markdown':  renderMarkdown(ctx); break;
    case 'settings':  renderSettings(ctx); break;
    default: renderDashboard(ctx);
  }
}

function handleEmit(event, payload) {
  switch (event) {
    case 'new-project':  openProjectModal(null, doRefresh); break;
    case 'edit-project': openProjectModal(payload, doRefresh); break;
    case 'new-prompt':   openPromptModal(null, ctx); break;
    case 'new-mcp':      openMcpModal(null, ctx); break;
    case 'import-markdown': triggerMarkdownImport(ctx); break;
  }
}

async function runCommand(projectId, commandIndex) {
  try {
    await api.executeCommand(projectId, commandIndex);
    toast('Command started', { type: 'success' });
    setTimeout(refreshRunningAndRender, 400);
  } catch (err) { toast(err.message || 'Failed to run', { type: 'error' }); }
}

async function stopCommand(projectId, commandIndex, commandName) {
  try {
    const res = await api.stopCommand(projectId, commandIndex, commandName);
    if (!res.success) toast(res.error || 'Nothing to stop', { type: 'error' });
    else toast(`Stopped ${commandName || 'command'}`, { type: 'success' });
    setTimeout(refreshRunningAndRender, 400);
  } catch (err) { toast(err.message || 'Failed to stop', { type: 'error' }); }
}

async function refreshRunningAndRender() {
  await refreshRunning();
  render();
}

function attachGlobalShortcuts() {
  document.addEventListener('keydown', (e) => {
    const inField = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || '') && !e.metaKey && !e.ctrlKey;
    if (inField && e.key !== 'Escape') return;

    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === 'k') { e.preventDefault(); openPalette(ctx); return; }
    if (mod && !e.shiftKey && e.key.toLowerCase() === 'n') { e.preventDefault(); openProjectModal(null, doRefresh); return; }
    if (mod && !e.shiftKey && e.key.toLowerCase() === 'p') { e.preventDefault(); openPromptModal(null, ctx); return; }
    if (mod && e.shiftKey && e.key.toLowerCase() === 'm') { e.preventDefault(); openMcpModal(null, ctx); return; }
    if (mod && !e.shiftKey && e.key.toLowerCase() === 'i') { e.preventDefault(); triggerMarkdownImport(ctx); return; }
    if (mod && e.key === ',') { e.preventDefault(); navigate('settings'); return; }
    if (mod && e.shiftKey && e.key.toLowerCase() === 'l') { e.preventDefault(); toggleTheme(); return; }
    if (!mod && !inField) {
      const n = Number(e.key);
      if (n >= 1 && n <= 5) {
        const map = ['dashboard', 'launcher', 'mcp', 'prompts', 'markdown'];
        navigate(map[n - 1]);
      }
    }
  });
}

function attachSystemThemeListener() {
  const mq = window.matchMedia('(prefers-color-scheme: light)');
  mq.addEventListener?.('change', () => { if (state.settings.theme === 'system') applySettingsToDocument(); });
}

function toggleTheme() {
  const next = state.settings.theme === 'dark' ? 'light' : 'dark';
  api.updateSettings({ ...state.settings, theme: next }).then(s => {
    state.settings = s;
    applySettingsToDocument();
    render();
    toast(`Theme: ${next}`);
  });
}

function attachGlobalDropzone() {
  document.addEventListener('dragover', (e) => {
    if ([...(e.dataTransfer?.items || [])].some(i => i.kind === 'file')) e.preventDefault();
  });
  document.addEventListener('drop', async (e) => {
    const files = [...(e.dataTransfer?.files || [])].filter(f => /\.md$/i.test(f.name));
    if (files.length === 0) return;
    e.preventDefault();
    const payload = [];
    for (const f of files) payload.push({ name: f.name, content: await f.text() });
    await api.importMarkdown({ files: payload });
    await doRefresh();
    toast(`Imported ${files.length} markdown file${files.length > 1 ? 's' : ''}`, { type: 'success' });
    if (state.section !== 'markdown') navigate('markdown');
  });
}

let pollTimer;
function startPolling() {
  clearInterval(pollTimer);
  pollTimer = setInterval(async () => {
    await refreshRunning();
    if (state.section === 'dashboard' || state.section === 'launcher') render();
  }, 8000);
}

window.addEventListener('hashchange', () => {
  const hash = (location.hash || '').replace('#', '');
  if (hash && ['dashboard', 'launcher', 'mcp', 'prompts', 'markdown', 'settings'].includes(hash) && hash !== state.section) {
    state.section = hash;
    render();
  }
});

init();
