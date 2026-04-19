async function request(url, options = {}) {
    const config = {
        headers: {},
        ...options,
    };

    if (config.body && typeof config.body === 'object' && !(config.body instanceof FormData)) {
        config.headers = {
            'Content-Type': 'application/json',
            ...config.headers,
        };
        config.body = JSON.stringify(config.body);
    }

    const response = await fetch(url, config);
    const contentType = response.headers.get('content-type') || '';
    const payload = contentType.includes('application/json')
        ? await response.json()
        : await response.text();

    if (!response.ok) {
        const message = typeof payload === 'string'
            ? payload
            : (payload?.error || payload?.message || 'Request failed');
        throw new Error(message);
    }

    return payload;
}

async function requestBlob(url, options = {}) {
    const config = {
        headers: {},
        ...options,
    };

    if (config.body && typeof config.body === 'object' && !(config.body instanceof FormData)) {
        config.headers = {
            'Content-Type': 'application/json',
            ...config.headers,
        };
        config.body = JSON.stringify(config.body);
    }

    const response = await fetch(url, config);
    if (!response.ok) {
        let message = 'Request failed';
        try {
            const payload = await response.json();
            message = payload?.error || message;
        } catch {
            message = await response.text() || message;
        }
        throw new Error(message);
    }

    return response.blob();
}

export const api = {
    bootstrap: () => request('/api/bootstrap'),

    createCategory: name => request('/api/categories', { method: 'POST', body: { name } }),
    deleteCategory: name => request(`/api/categories/${encodeURIComponent(name)}`, { method: 'DELETE' }),

    createProject: body => request('/api/projects', { method: 'POST', body }),
    updateProject: (id, body) => request(`/api/projects/${id}`, { method: 'PUT', body }),
    deleteProject: id => request(`/api/projects/${id}`, { method: 'DELETE' }),
    reorderProjects: ids => request('/api/projects/reorder', { method: 'POST', body: { ids } }),
    executeProjectCommand: (id, commandIndex) => request(`/api/projects/${id}/execute`, { method: 'POST', body: { commandIndex } }),
    stopProjectCommand: (id, commandIndex, commandName) => request(`/api/projects/${id}/stop`, { method: 'POST', body: { commandIndex, commandName } }),
    openProjectIde: id => request(`/api/projects/${id}/open-ide`, { method: 'POST' }),

    createMcpServer: body => request('/api/mcp-servers', { method: 'POST', body }),
    updateMcpServer: (id, body) => request(`/api/mcp-servers/${id}`, { method: 'PUT', body }),
    deleteMcpServer: id => request(`/api/mcp-servers/${id}`, { method: 'DELETE' }),
    discoverMcpServer: id => request(`/api/mcp-servers/${id}/discover`, { method: 'POST' }),
    invokeMcpTool: (id, toolName, argumentsBody) => request(`/api/mcp-servers/${id}/tools/${encodeURIComponent(toolName)}/invoke`, {
        method: 'POST',
        body: { arguments: argumentsBody },
    }),

    createPrompt: body => request('/api/prompts', { method: 'POST', body }),
    updatePrompt: (id, body) => request(`/api/prompts/${id}`, { method: 'PUT', body }),
    duplicatePrompt: id => request(`/api/prompts/${id}/duplicate`, { method: 'POST' }),
    deletePrompt: id => request(`/api/prompts/${id}`, { method: 'DELETE' }),

    importMarkdownFiles: body => request('/api/markdown-files/import', { method: 'POST', body }),
    getMarkdownFile: id => request(`/api/markdown-files/${id}`),
    getMarkdownFilesBatch: ids => request('/api/markdown-files/batch', { method: 'POST', body: { ids } }),
    updateMarkdownFile: (id, body) => request(`/api/markdown-files/${id}`, { method: 'PUT', body }),
    deleteMarkdownFile: id => request(`/api/markdown-files/${id}`, { method: 'DELETE' }),
    exportMarkdownZip: ids => requestBlob('/api/markdown-files/export', { method: 'POST', body: { ids } }),
};
