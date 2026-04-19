import { api } from './api.js';

export const state = {
  bootstrapped: false,
  section: 'dashboard',
  categories: [],
  projects: [],
  mcpServers: [],
  prompts: [],
  markdownFiles: [],
  running: [],
  activity: [],
  settings: {
    theme: 'dark',
    accent: 'indigo',
    density: 'comfortable',
    reduceMotion: false,
    showStatusDots: true,
    defaultIde: 'code',
    startupSection: 'dashboard',
  },

  // view-local state (namespaced to avoid collision with data arrays)
  launcher: { workspace: 'all', view: 'grid', sort: 'recent', filter: 'all', search: '', selectedId: null },
  mcp: { selectedServerId: null, selectedTool: null, tab: 'tools', mode: 'form', lastResult: null, lastError: null, formValues: {} },
  promptsView: { filter: 'all', tag: null, format: null, search: '', selectedId: null, sort: 'recent' },
  markdown: { filter: 'all', tag: null, selection: new Set(), search: '', selectedId: null },
  settings_view: { section: 'appearance' },
};

const listeners = new Set();
export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function notify() { for (const fn of listeners) fn(state); }

export async function bootstrap() {
  const data = await api.bootstrap();
  state.categories = data.categories || [];
  state.projects = data.projects || [];
  state.mcpServers = data.mcpServers || [];
  state.prompts = data.prompts || [];
  state.markdownFiles = data.markdownFiles || [];
  state.running = data.running || [];
  state.activity = data.activity || [];
  state.settings = { ...state.settings, ...(data.settings || {}) };
  if (!state.mcp.selectedServerId && state.mcpServers[0]) state.mcp.selectedServerId = state.mcpServers[0].id;
  if (!state.promptsView.selectedId && state.prompts[0]) state.promptsView.selectedId = state.prompts[0].id;
  if (!state.markdown.selectedId && state.markdownFiles[0]) state.markdown.selectedId = state.markdownFiles[0].id;
  state.bootstrapped = true;
  applySettingsToDocument();
  notify();
}

export function applySettingsToDocument() {
  const html = document.documentElement;
  const s = state.settings;
  let theme = s.theme;
  if (theme === 'system') {
    theme = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }
  html.dataset.theme = theme;
  html.dataset.accent = s.accent || 'indigo';
  html.dataset.density = s.density || 'comfortable';
  html.dataset.reduceMotion = s.reduceMotion ? 'true' : 'false';
}

export async function refreshRunning() {
  try {
    state.running = await api.listRunning();
    notify();
  } catch {}
}

export async function refreshActivity() {
  try {
    state.activity = await api.listActivity(30);
    notify();
  } catch {}
}

// Helpers
export function getProject(id) { return state.projects.find(p => p.id === id); }
export function getMcp(id) { return state.mcpServers.find(s => s.id === id); }
export function getPrompt(id) { return state.prompts.find(p => p.id === id); }
export function getMarkdown(id) { return state.markdownFiles.find(f => f.id === id); }

export function isRunning(projectId, commandIndex) {
  return state.running.some(r => r.projectId === projectId && Number(r.commandIndex) === Number(commandIndex));
}
export function anyRunning(projectId) {
  return state.running.some(r => r.projectId === projectId);
}
export function firstRunning(projectId) {
  return state.running.find(r => r.projectId === projectId);
}
