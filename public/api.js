async function request(url, options = {}) {
  const config = {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  };
  if (config.body && typeof config.body !== 'string' && !(config.body instanceof FormData)) {
    config.body = JSON.stringify(config.body);
  }
  const res = await fetch(url, config);
  if (res.status === 204) return null;
  const text = await res.text();
  let data = null;
  if (text) {
    try { data = JSON.parse(text); } catch { data = text; }
  }
  if (!res.ok) {
    const err = new Error((data && data.error) || `Request failed: ${res.status}`);
    err.status = res.status;
    err.body = data;
    throw err;
  }
  return data;
}

export const api = {
  bootstrap: () => request('/api/bootstrap'),

  // Projects
  listProjects: () => request('/api/projects'),
  createProject: (body) => request('/api/projects', { method: 'POST', body }),
  updateProject: (id, body) => request(`/api/projects/${id}`, { method: 'PUT', body }),
  deleteProject: (id) => request(`/api/projects/${id}`, { method: 'DELETE' }),
  reorderProjects: (ids) => request('/api/projects/reorder', { method: 'POST', body: { ids } }),
  executeCommand: (id, commandIndex) => request(`/api/projects/${id}/execute`, { method: 'POST', body: { commandIndex } }),
  stopCommand: (id, commandIndex, commandName) => request(`/api/projects/${id}/stop`, { method: 'POST', body: { commandIndex, commandName } }),
  openIde: (id) => request(`/api/projects/${id}/open-ide`, { method: 'POST' }),
  openTerminal: (id) => request(`/api/projects/${id}/open-terminal`, { method: 'POST' }),
  projectHealth: (id) => request(`/api/projects/${id}/health`),
  linkProject: (id, body) => request(`/api/projects/${id}/links`, { method: 'PUT', body }),

  // Categories
  createCategory: (name) => request('/api/categories', { method: 'POST', body: { name } }),
  deleteCategory: (name) => request(`/api/categories/${encodeURIComponent(name)}`, { method: 'DELETE' }),

  // MCP
  listMcp: () => request('/api/mcp-servers'),
  createMcp: (body) => request('/api/mcp-servers', { method: 'POST', body }),
  updateMcp: (id, body) => request(`/api/mcp-servers/${id}`, { method: 'PUT', body }),
  deleteMcp: (id) => request(`/api/mcp-servers/${id}`, { method: 'DELETE' }),
  discoverMcp: (id) => request(`/api/mcp-servers/${id}/discover`, { method: 'POST' }),
  invokeTool: (id, toolName, args) => request(`/api/mcp-servers/${id}/tools/${encodeURIComponent(toolName)}/invoke`, { method: 'POST', body: { arguments: args } }),

  // Prompts
  listPrompts: () => request('/api/prompts'),
  createPrompt: (body) => request('/api/prompts', { method: 'POST', body }),
  updatePrompt: (id, body) => request(`/api/prompts/${id}`, { method: 'PUT', body }),
  deletePrompt: (id) => request(`/api/prompts/${id}`, { method: 'DELETE' }),
  duplicatePrompt: (id) => request(`/api/prompts/${id}/duplicate`, { method: 'POST' }),

  // Markdown
  listMarkdown: () => request('/api/markdown-files'),
  getMarkdown: (id) => request(`/api/markdown-files/${id}`),
  importMarkdown: (body) => request('/api/markdown-files/import', { method: 'POST', body }),
  updateMarkdown: (id, body) => request(`/api/markdown-files/${id}`, { method: 'PUT', body }),
  deleteMarkdown: (id) => request(`/api/markdown-files/${id}`, { method: 'DELETE' }),
  exportMarkdownUrl: '/api/markdown-files/export',

  // New: running, activity, settings, backup, search
  listRunning: () => request('/api/running'),
  listActivity: (limit = 30) => request(`/api/activity?limit=${limit}`),
  clearActivity: () => request('/api/activity', { method: 'DELETE' }),
  getSettings: () => request('/api/settings'),
  updateSettings: (body) => request('/api/settings', { method: 'PUT', body }),
  exportBackupUrl: '/api/backup',
  restoreBackup: (body) => request('/api/backup', { method: 'POST', body }),
  search: (q) => request(`/api/search?q=${encodeURIComponent(q)}`),
};
