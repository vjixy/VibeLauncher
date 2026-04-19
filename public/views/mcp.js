import { el, mount, timeAgo, highlightJson, escapeHtml } from '../utils.js';
import { state, getMcp } from '../state.js';
import { renderSidebar, renderHeader, panelBlock } from '../chrome.js';
import { openModal, closeModal, toast, confirmDialog } from '../ui.js';
import { api } from '../api.js';

export function renderMcp(ctx) {
  const ms = state.mcp;
  if (!ms.selectedServerId && state.mcpServers[0]) ms.selectedServerId = state.mcpServers[0].id;
  const server = getMcp(ms.selectedServerId);

  renderSidebar({ ...ctx, contextPanel: buildSidebar(ctx) });
  renderHeader({
    title: server ? `MCP · ${server.name}` : 'MCP',
    subtitle: server ? headerSubtitle(server) : `${state.mcpServers.length} servers`,
    onPalette: ctx.onPalette,
    searchPlaceholder: 'Search tools, resources, prompts…',
    onSearch: () => {},
    actions: [
      server ? el('button', { class: 'btn btn-secondary', onclick: () => discoverServer(server, ctx) }, [
        el('i', { class: 'ph ph-arrow-clockwise text-[13px]' }), 'Re-discover',
      ]) : null,
      el('button', { class: 'btn btn-primary', onclick: () => openMcpModal(null, ctx) }, [
        el('i', { class: 'ph ph-plus text-[13px]' }), 'Add Server',
      ]),
    ],
  });

  const content = document.getElementById('appContent');

  if (state.mcpServers.length === 0) {
    mount(content, el('div', { class: 'empty-state' }, [
      el('div', { class: 'ic' }, [el('i', { class: 'ph ph-plugs' })]),
      el('h3', {}, ['No MCP servers connected']),
      el('p', {}, ['Add a server by URL, stdio command, or SSE endpoint.']),
      el('button', { class: 'btn btn-primary', onclick: () => openMcpModal(null, ctx) }, [el('i', { class: 'ph ph-plus' }), 'Add server']),
    ]));
    return;
  }

  if (!server) { mount(content, el('div', { class: 'empty-state' }, [el('h3', {}, ['Select a server']), el('p', {}, ['Pick a server from the sidebar.'])])); return; }

  mount(content, el('section', { class: 'grid', style: { gridTemplateColumns: '1fr 1fr', minHeight: 'calc(100vh - 56px)' } }, [
    leftColumn(server, ctx),
    rightColumn(server, ctx),
  ]));
}

function headerSubtitle(server) {
  const url = server.transport === 'stdio' ? server.command : server.url;
  const tools = (server.tools || []).length;
  const caps = Object.entries(server.capabilities || {}).filter(([, v]) => v).map(([k]) => k);
  return [el('span', { class: 'mono' }, [url || '(not set)']), ` · ${tools} tools${caps.length ? ` · ${caps.join(', ')}` : ''}`];
}

function buildSidebar(ctx) {
  const ms = state.mcp;
  return el('div', { class: 'flex flex-col gap-4 flex-1 min-h-0' }, [
    panelBlock('Servers',
      el('button', { onclick: () => openMcpModal(null, ctx) }, ['+ Add']),
      [
        el('div', { class: 'flex flex-col gap-1 overflow-y-auto', style: { minHeight: 0 } },
          state.mcpServers.map(s => el('button', {
            class: `srv-row ${ms.selectedServerId === s.id ? 'active' : ''}`,
            style: { width: '100%', border: '1px solid transparent', textAlign: 'left' },
            onclick: () => { ms.selectedServerId = s.id; ms.selectedTool = null; ms.lastResult = null; ms.lastError = null; renderMcp(ctx); },
          }, [
            el('span', { class: `dot ${statusDot(s.lastStatus)}` }),
            el('div', { class: 'flex-1 min-w-0' }, [
              el('div', { class: 'text-[12.5px] font-semibold truncate-1' }, [s.name]),
              el('div', { class: 'text-[10.5px] mono truncate-1', style: { color: s.lastStatus === 'offline' ? 'var(--red)' : 'var(--text-2)' } }, [
                s.lastStatus === 'offline' && s.lastError ? s.lastError : (s.transport === 'stdio' ? s.command : s.url) || '—',
              ]),
            ]),
            el('span', { class: `transport t-${transportKey(s.transport)}` }, [transportLabel(s.transport)]),
          ]))
        ),
      ]),
  ]);
}

function statusDot(status) {
  if (status === 'online') return 'dot-green';
  if (status === 'offline') return 'dot-red';
  return 'dot-gray';
}
function transportKey(t) {
  if (t === 'streamable-http') return 'http';
  if (t === 'sse') return 'sse';
  return 'stdio';
}
function transportLabel(t) {
  if (t === 'streamable-http') return 'HTTP';
  if (t === 'sse') return 'SSE';
  return 'STDIO';
}

async function discoverServer(server, ctx) {
  toast(`Discovering ${server.name}…`);
  try {
    await api.discoverMcp(server.id);
    await ctx.refresh();
    toast(`${server.name} online`, { type: 'success' });
  } catch (err) {
    await ctx.refresh();
    toast(err.message || 'Discover failed', { type: 'error' });
  }
}

function leftColumn(server, ctx) {
  const ms = state.mcp;
  return el('div', { class: 'p-5 border-r overflow-y-auto', style: { borderColor: 'var(--line-1)', minWidth: 0 } }, [
    serverHeaderCard(server, ctx),
    el('div', { class: 'mt-4 tabs-row', style: { padding: 0 } }, [
      tabBtn('tools', `Tools`, (server.tools || []).length),
      tabBtn('resources', 'Resources', server.capabilities?.resources ? '•' : 0),
      tabBtn('prompts', 'Prompts', server.capabilities?.prompts ? '•' : 0),
      tabBtn('capabilities', 'Capabilities'),
    ]),
    el('div', { class: 'mt-4' }, [toolsTabContent(server, ctx)]),
  ]);

  function tabBtn(key, label, count) {
    return el('div', { class: `tab ${ms.tab === key ? 'active' : ''}`, onclick: () => { ms.tab = key; renderMcp(ctx); } }, [
      label,
      count ? el('span', { class: 'pill pill-sm ml-1' }, [String(count)]) : null,
    ]);
  }
}

function serverHeaderCard(server, ctx) {
  const online = server.lastStatus === 'online';
  return el('div', { class: 'card', style: { padding: '16px' } }, [
    el('div', { class: 'flex items-start gap-3' }, [
      el('div', { class: 'w-10 h-10 rounded-lg flex items-center justify-center', style: { background: 'var(--accent-soft)', color: 'var(--accent-hover)' } }, [
        el('i', { class: 'ph-fill ph-plugs-connected text-[20px]' }),
      ]),
      el('div', { class: 'flex-1 min-w-0' }, [
        el('div', { class: 'flex items-center gap-2 flex-wrap' }, [
          el('h2', { class: 'text-[16px] font-semibold' }, [server.name]),
          el('span', { class: `pill pill-sm ${online ? 'pill-running' : server.lastStatus === 'offline' ? 'pill-offline' : ''}` }, [
            online ? el('span', { class: 'dot dot-green pulse', style: { width: '5px', height: '5px' } }) : null,
            online ? 'online' : server.lastStatus === 'offline' ? 'offline' : 'not discovered',
          ]),
          el('span', { class: `transport t-${transportKey(server.transport)}` }, [transportLabel(server.transport)]),
        ]),
        el('div', { class: 'text-[11.5px] mono mt-1', style: { color: 'var(--text-2)' } }, [
          server.transport === 'stdio' ? `${server.command} ${(server.args || []).join(' ')}` : (server.url || '—'),
        ]),
        server.lastStatus === 'offline' && server.lastError ? el('div', { class: 'text-[11.5px] mt-1', style: { color: 'var(--red)' } }, [server.lastError]) : null,
      ]),
      el('div', { class: 'flex items-center gap-1' }, [
        el('button', { class: 'btn btn-sm btn-secondary', onclick: () => discoverServer(server, ctx) }, [el('i', { class: 'ph ph-arrow-clockwise text-[12px]' }), 'Discover']),
        el('button', { class: 'btn btn-sm btn-ghost btn-icon', onclick: () => openMcpModal(server, ctx) }, [el('i', { class: 'ph ph-pencil-simple text-[13px]' })]),
        el('button', { class: 'btn btn-sm btn-ghost btn-icon', onclick: async () => {
          const ok = await confirmDialog({ title: 'Delete server?', message: `Remove "${server.name}" from Vibe Launcher?`, confirmLabel: 'Delete', danger: true });
          if (!ok) return;
          await api.deleteMcp(server.id);
          state.mcp.selectedServerId = null;
          await ctx.refresh();
          toast('Server deleted');
        } }, [el('i', { class: 'ph ph-trash text-[13px]', style: { color: 'var(--red)' } })]),
      ]),
    ]),
    el('div', { class: 'mt-3 pt-3 border-t grid grid-cols-4 gap-3 text-[11.5px]', style: { borderColor: 'var(--line-1)' } }, [
      kv('Last check', server.lastCheckedAt ? timeAgo(server.lastCheckedAt) : 'never'),
      kv('Transport', transportLabel(server.transport)),
      kv('Timeout', server.timeout ? `${server.timeout} ms` : 'default'),
      kv('Auth', server.bearerToken ? 'Bearer' : (server.headers || []).length ? 'headers' : 'none'),
    ]),
  ]);
}

function kv(label, value) {
  return el('div', {}, [
    el('div', { style: { color: 'var(--text-2)' } }, [label]),
    el('div', { class: 'mt-0.5', style: { color: 'var(--text-0)' } }, [value]),
  ]);
}

function toolsTabContent(server, ctx) {
  const ms = state.mcp;
  if (ms.tab === 'capabilities') {
    const caps = server.capabilities || {};
    const info = server.serverInfo || {};
    return el('div', { class: 'card', style: { padding: '16px' } }, [
      el('div', { class: 'label-sm mb-2' }, ['Server Info']),
      el('pre', { class: 'json-out', style: { maxHeight: '220px' }, html: highlightJson(info) }, []),
      el('div', { class: 'label-sm mt-4 mb-2' }, ['Capabilities']),
      el('pre', { class: 'json-out', html: highlightJson(caps) }, []),
    ]);
  }
  if (ms.tab === 'resources' || ms.tab === 'prompts') {
    const avail = !!(server.capabilities || {})[ms.tab];
    return el('div', { class: 'card empty-state' }, [
      el('div', { class: 'ic', style: { background: 'var(--cyan-soft)', color: 'var(--cyan)' } }, [
        el('i', { class: ms.tab === 'prompts' ? 'ph ph-chat-circle-text' : 'ph ph-folder' }),
      ]),
      el('h3', {}, [avail ? `${ms.tab} available` : `No ${ms.tab} exposed`]),
      el('p', {}, [avail ? `This server advertises ${ms.tab}, but detailed listing isn't wired up yet.` : `This server doesn't advertise ${ms.tab} capabilities.`]),
    ]);
  }
  // tools tab
  const tools = server.tools || [];
  if (tools.length === 0) {
    return el('div', { class: 'card empty-state' }, [
      el('div', { class: 'ic' }, [el('i', { class: 'ph ph-wrench' })]),
      el('p', {}, ['No tools yet. Click Discover to fetch them.']),
      el('button', { class: 'btn btn-primary', onclick: () => discoverServer(server, ctx) }, [el('i', { class: 'ph ph-arrow-clockwise' }), 'Discover now']),
    ]);
  }
  return el('div', { class: 'flex flex-col gap-2' }, tools.map(t => toolCard(t, server, ctx)));
}

function toolCard(tool, server, ctx) {
  const ms = state.mcp;
  const active = ms.selectedTool === tool.name;
  const schema = tool.inputSchema || {};
  const required = schema.required || [];
  const props = schema.properties || {};
  const opt = Object.keys(props).filter(k => !required.includes(k)).length;

  return el('div', {
    class: `tool-card ${active ? 'active' : ''}`,
    onclick: () => { ms.selectedTool = tool.name; ms.lastResult = null; ms.lastError = null; renderMcp(ctx); },
  }, [
    el('div', { class: 'flex items-center gap-2' }, [
      el('i', { class: 'ph ph-wrench text-[13px]', style: { color: active ? 'var(--accent-hover)' : 'var(--text-1)' } }),
      el('span', { class: 'text-[13.5px] font-semibold' }, [tool.name]),
      el('span', { class: 'pill pill-sm', style: { marginLeft: 'auto' } }, [`${required.length} req${opt > 0 ? ` · ${opt} opt` : ''}`]),
    ]),
    tool.description ? el('div', { class: 'text-[11.5px] mt-1 truncate-2', style: { color: 'var(--text-2)' } }, [tool.description]) : null,
  ]);
}

function rightColumn(server, ctx) {
  const ms = state.mcp;
  const tool = (server.tools || []).find(t => t.name === ms.selectedTool) || (server.tools || [])[0];
  if (tool && ms.selectedTool !== tool.name) ms.selectedTool = tool.name;

  if (!tool) {
    return el('div', { class: 'p-5 overflow-y-auto' }, [
      el('div', { class: 'empty-state' }, [el('p', {}, ['Select a tool to test it.'])]),
    ]);
  }
  return el('div', { class: 'overflow-y-auto flex flex-col', style: { minWidth: 0 } }, [
    el('div', { class: 'p-5' }, [
      el('div', { class: 'flex items-center gap-2 flex-wrap' }, [
        el('i', { class: 'ph-fill ph-wrench text-[14px]', style: { color: 'var(--accent-hover)' } }),
        el('h3', { class: 'text-[15px] font-semibold' }, [tool.name]),
        el('div', { class: 'seg ml-auto' }, [
          el('button', { class: ms.mode === 'form' ? 'active' : '', onclick: () => { ms.mode = 'form'; renderMcp(ctx); } }, [el('i', { class: 'ph ph-text-aa text-[11px]' }), 'Form']),
          el('button', { class: ms.mode === 'json' ? 'active' : '', onclick: () => { ms.mode = 'json'; renderMcp(ctx); } }, [el('i', { class: 'ph ph-brackets-curly text-[11px]' }), 'Raw JSON']),
        ]),
      ]),
      tool.description ? el('p', { class: 'text-[12.5px] mt-1.5', style: { color: 'var(--text-1)' } }, [tool.description]) : null,
      toolFormOrJson(tool, server, ctx),
      resultPanel(ctx),
    ]),
    historyPanel(server),
  ]);
}

function toolFormOrJson(tool, server, ctx) {
  const ms = state.mcp;
  const schema = tool.inputSchema || { type: 'object', properties: {} };

  if (ms.mode === 'json') {
    const ta = el('textarea', {
      class: 'mono',
      style: { width: '100%', minHeight: '160px', background: 'var(--bg-2)', border: '1px solid var(--line-1)', borderRadius: '8px', padding: '10px', color: 'var(--text-0)', fontSize: '12px', resize: 'vertical' },
    });
    ta.value = JSON.stringify(ms.formValues?.[tool.name] || buildDefaultArgs(tool), null, 2);
    return el('div', { class: 'mt-4' }, [
      el('div', { class: 'label-sm mb-1' }, ['Arguments (JSON)']),
      ta,
      el('div', { class: 'flex items-center gap-2 mt-3' }, [
        el('button', { class: 'btn btn-primary', onclick: () => runFromJson(ta.value, tool, server, ctx) }, [el('i', { class: 'ph-fill ph-play text-[12px]' }), 'Run tool']),
        el('span', { class: 'text-[11px] ml-auto', style: { color: 'var(--text-2)' } }, [el('span', { class: 'kbd' }, ['⌘']), el('span', { class: 'kbd' }, ['↵']), ' to run']),
      ]),
    ]);
  }

  const values = ms.formValues?.[tool.name] || buildDefaultArgs(tool);
  ms.formValues = ms.formValues || {};
  ms.formValues[tool.name] = values;

  const props = schema.properties || {};
  const keys = Object.keys(props);

  const fields = keys.map(key => renderSchemaField(key, props[key], values, (schema.required || []).includes(key)));

  return el('div', { class: 'mt-4 flex flex-col gap-3' }, [
    ...fields,
    el('div', { class: 'flex items-center gap-2 pt-1' }, [
      el('button', { class: 'btn btn-primary', onclick: () => runTool(tool, server, values, ctx) }, [el('i', { class: 'ph-fill ph-play text-[12px]' }), 'Run tool']),
      el('button', { class: 'btn btn-secondary', onclick: () => { navigator.clipboard?.writeText(JSON.stringify(values, null, 2)); toast('Args copied'); } }, [el('i', { class: 'ph ph-copy text-[13px]' }), 'Copy as JSON']),
      el('span', { class: 'text-[11px] ml-auto', style: { color: 'var(--text-2)' } }, [el('span', { class: 'kbd' }, ['⌘']), el('span', { class: 'kbd' }, ['↵']), ' to run']),
    ]),
  ]);
}

function buildDefaultArgs(tool) {
  const props = (tool.inputSchema || {}).properties || {};
  const out = {};
  for (const [key, schema] of Object.entries(props)) {
    if (schema.default !== undefined) out[key] = schema.default;
    else if (schema.type === 'number' || schema.type === 'integer') out[key] = '';
    else if (schema.type === 'boolean') out[key] = false;
    else if (schema.type === 'array') out[key] = [];
    else out[key] = '';
  }
  return out;
}

function renderSchemaField(key, schema, values, required) {
  const label = el('label', { class: 'text-[11.5px] font-medium flex items-center gap-1.5', style: { color: 'var(--text-1)' } }, [
    key,
    required ? el('span', { style: { color: 'var(--red)' } }, ['*']) : null,
    el('span', { class: 'text-[10.5px] mono', style: { color: 'var(--text-3)' } }, [schema.type || 'string']),
  ]);

  let input;
  if (Array.isArray(schema.enum)) {
    input = document.createElement('select');
    (schema.enum || []).forEach(opt => {
      const o = document.createElement('option');
      o.value = opt; o.textContent = opt;
      if (String(values[key]) === String(opt)) o.selected = true;
      input.appendChild(o);
    });
    input.onchange = () => { values[key] = input.value; };
    return el('div', {}, [label, el('div', { class: 'field mt-1' }, [input])]);
  }
  if (schema.type === 'boolean') {
    const toggle = el('button', { class: `toggle ${values[key] ? 'on' : ''}`, onclick: (e) => { e.preventDefault(); values[key] = !values[key]; toggle.classList.toggle('on'); } });
    return el('div', {}, [label, el('div', { class: 'mt-1 flex items-center gap-2' }, [toggle, el('span', { class: 'text-[12px]', style: { color: 'var(--text-1)' } }, [values[key] ? 'on' : 'off'])])]);
  }
  if (schema.type === 'array' || schema.type === 'object') {
    const ta = document.createElement('textarea');
    ta.className = 'mono';
    ta.rows = 3;
    ta.value = typeof values[key] === 'string' ? values[key] : JSON.stringify(values[key] || (schema.type === 'array' ? [] : {}), null, 2);
    ta.oninput = () => {
      try { values[key] = JSON.parse(ta.value); } catch { values[key] = ta.value; }
    };
    return el('div', {}, [label, el('div', { class: 'field field-block mt-1' }, [ta])]);
  }
  input = document.createElement('input');
  input.value = values[key] ?? '';
  if (schema.type === 'number' || schema.type === 'integer') input.className = 'mono';
  input.oninput = () => {
    const raw = input.value;
    if (schema.type === 'number' || schema.type === 'integer') {
      const n = Number(raw);
      values[key] = raw === '' ? '' : (Number.isNaN(n) ? raw : n);
    } else values[key] = raw;
  };
  return el('div', {}, [label, el('div', { class: 'field mt-1' }, [input])]);
}

async function runTool(tool, server, values, ctx) {
  const args = {};
  for (const [k, v] of Object.entries(values)) {
    if (v === '' || v === undefined || v === null) continue;
    args[k] = v;
  }
  const ms = state.mcp;
  ms.lastResult = null;
  ms.lastError = null;
  try {
    const started = performance.now();
    const result = await api.invokeTool(server.id, tool.name, args);
    ms.lastResult = { ...result, ms: Math.round(performance.now() - started) };
    await ctx.refresh();
    toast(`${tool.name} ok`, { type: 'success' });
  } catch (err) {
    ms.lastError = err.message || 'Invocation failed';
    toast(ms.lastError, { type: 'error' });
    renderMcp(ctx);
  }
}

function runFromJson(raw, tool, server, ctx) {
  try {
    const values = JSON.parse(raw);
    runTool(tool, server, values, ctx);
  } catch {
    toast('Invalid JSON', { type: 'error' });
  }
}

function resultPanel(ctx) {
  const ms = state.mcp;
  if (!ms.lastResult && !ms.lastError) return null;
  if (ms.lastError) {
    return el('div', { class: 'mt-5 card', style: { padding: '16px', borderColor: 'rgba(226,106,106,0.25)' } }, [
      el('div', { class: 'flex items-center gap-2' }, [
        el('i', { class: 'ph-fill ph-x-circle text-[14px]', style: { color: 'var(--red)' } }),
        el('span', { class: 'text-[12.5px]', style: { color: 'var(--red)' } }, [ms.lastError]),
      ]),
    ]);
  }
  const r = ms.lastResult;
  return el('div', { class: 'mt-5 card', style: { overflow: 'hidden' } }, [
    el('div', { class: 'flex items-center border-b', style: { borderColor: 'var(--line-1)', padding: '0 16px' } }, [
      el('div', { class: 'tab active', style: { marginRight: 0, padding: '10px 0' } }, ['Output']),
      el('div', { class: 'ml-auto pr-2 flex items-center gap-2 text-[11px]', style: { color: r.isError ? 'var(--red)' : 'var(--green)' } }, [
        el('i', { class: `ph-fill ${r.isError ? 'ph-x-circle' : 'ph-check-circle'} text-[12px]` }),
        r.isError ? 'Error' : `OK${r.ms ? ` · ${r.ms}ms` : ''}`,
      ]),
    ]),
    el('div', { style: { padding: '14px' } }, [
      r.textOutput ? el('pre', { class: 'json-out', style: { maxHeight: '260px' } }, [r.textOutput]) : null,
      r.structuredContent ? el('pre', { class: 'json-out', style: { maxHeight: '260px', marginTop: r.textOutput ? '10px' : 0 }, html: highlightJson(r.structuredContent) }) : null,
    ]),
  ]);
}

function historyPanel(server) {
  const history = server.history || [];
  if (history.length === 0) return null;
  return el('div', { class: 'mt-auto border-t', style: { borderColor: 'var(--line-1)', background: 'var(--bg-1)', padding: '12px 16px' } }, [
    el('div', { class: 'flex items-center justify-between px-2 pb-2' }, [
      el('div', { class: 'label-sm' }, ['Run history']),
      el('button', { class: 'text-[11px]', style: { color: 'var(--text-2)', background: 'transparent', border: 0, cursor: 'pointer' } }, ['Clear']),
    ]),
    el('div', { class: 'flex flex-col' }, history.slice(0, 6).map(h => el('div', { class: 'hist-row' }, [
      el('i', { class: `ph-fill ${h.success ? 'ph-check-circle' : 'ph-x-circle'} text-[12px]`, style: { color: h.success ? 'var(--green)' : 'var(--red)' } }),
      el('span', { class: 'mono', style: { color: 'var(--text-2)' } }, [timeAgo(h.timestamp)]),
      el('span', { class: 'truncate-1 mono', style: { color: h.success ? 'var(--text-1)' : 'var(--red)' } }, [previewArgs(h)]),
      el('span', { style: { color: h.success ? 'var(--green)' : 'var(--red)' } }, [h.success ? 'ok' : 'error']),
    ]))),
  ]);
}

function previewArgs(entry) {
  try {
    return `${entry.toolName}: ${JSON.stringify(entry.arguments).slice(0, 60)}`;
  } catch { return entry.toolName; }
}

/* ===== Server modal ===== */
export function openMcpModal(existing, ctx) {
  const isNew = !existing;
  const server = existing || { name: '', description: '', transport: 'streamable-http', url: '', command: '', args: [], cwd: '', timeout: null, bearerToken: '', headers: [], env: [], roots: [], notes: '' };

  const nameInput = mkInput(server.name);
  const descInput = mkInput(server.description);
  const urlInput = mkInput(server.url, true);
  const bearerInput = mkInput(server.bearerToken, true);
  const commandInput = mkInput(server.command, true);
  const argsInput = mkInput((server.args || []).join(' '), true);
  const cwdInput = mkInput(server.cwd, true);
  const timeoutInput = mkInput(server.timeout ? String(server.timeout) : '', true);

  let transport = server.transport || 'streamable-http';
  let headers = [...(server.headers || [])];
  let env = [...(server.env || [])];
  let roots = [...(server.roots || [])];

  const fieldsContainer = el('div', { class: 'flex flex-col gap-3' });
  function renderFields() {
    fieldsContainer.innerHTML = '';
    if (transport === 'stdio') {
      fieldsContainer.appendChild(fieldWrap(commandInput, 'Command'));
      fieldsContainer.appendChild(fieldWrap(argsInput, 'Args (space-separated)'));
      fieldsContainer.appendChild(fieldWrap(cwdInput, 'Working directory (optional)'));
    } else {
      fieldsContainer.appendChild(fieldWrap(urlInput, 'URL', { required: true }));
      fieldsContainer.appendChild(fieldWrap(bearerInput, 'Bearer token (optional)'));
    }
    fieldsContainer.appendChild(fieldWrap(timeoutInput, 'Timeout (ms, optional)'));
  }
  renderFields();

  const transportRow = el('div', { class: 'seg', style: { width: '100%' } }, ['streamable-http', 'sse', 'stdio'].map(t =>
    el('button', { class: `flex-1 justify-center ${transport === t ? 'active' : ''}`, onclick: (e) => { e.preventDefault(); transport = t; renderFields(); transportRow.querySelectorAll('button').forEach(b => b.classList.toggle('active', b.textContent === t || (t === 'streamable-http' && b.textContent.includes('http')))); } }, [
      t === 'streamable-http' ? 'HTTP' : t === 'sse' ? 'SSE' : 'STDIO',
    ])
  ));

  openModal({
    title: isNew ? 'Connect MCP server' : 'Edit MCP server',
    icon: 'ph ph-plugs',
    wide: true,
    body: el('div', { class: 'grid grid-cols-2 gap-6' }, [
      el('div', { class: 'flex flex-col gap-3' }, [
        fieldWrap(nameInput, 'Name', { required: true }),
        fieldWrap(descInput, 'Description'),
        el('div', {}, [
          el('div', { class: 'label-sm mb-1' }, ['Transport']),
          transportRow,
        ]),
        fieldsContainer,
      ]),
      el('div', { class: 'flex flex-col gap-3' }, [
        kvEditor('Headers', headers, (next) => { headers = next; }),
        kvEditor('Environment', env, (next) => { env = next; }),
        arrayEditor('Roots (paths)', roots, (next) => { roots = next; }),
      ]),
    ]),
    footer: el('div', { class: 'flex items-center gap-2' }, [
      el('button', { class: 'btn btn-ghost', onclick: closeModal }, ['Cancel']),
      el('button', { class: 'btn btn-primary', onclick: async () => {
        const body = {
          name: nameInput.value.trim(),
          description: descInput.value.trim(),
          transport,
          url: urlInput.value.trim(),
          command: commandInput.value.trim(),
          args: argsInput.value.trim() ? argsInput.value.trim().split(/\s+/) : [],
          cwd: cwdInput.value.trim(),
          bearerToken: bearerInput.value.trim(),
          timeout: timeoutInput.value ? Number(timeoutInput.value) : null,
          headers,
          env,
          roots,
        };
        if (!body.name) return toast('Name is required', { type: 'error' });
        if (transport === 'stdio' && !body.command) return toast('Command is required', { type: 'error' });
        if (transport !== 'stdio' && !body.url) return toast('URL is required', { type: 'error' });
        try {
          if (isNew) await api.createMcp(body);
          else await api.updateMcp(existing.id, body);
          closeModal();
          await ctx.refresh();
          toast(isNew ? 'Server connected' : 'Server updated', { type: 'success' });
        } catch (e) { toast(e.message || 'Failed', { type: 'error' }); }
      } }, [isNew ? 'Connect' : 'Save']),
    ]),
  });
}

function mkInput(value, mono = false) {
  const i = document.createElement('input');
  i.value = value || '';
  if (mono) i.classList.add('mono');
  return i;
}
function fieldWrap(node, label, opts = {}) {
  return el('div', {}, [
    el('div', { class: 'label-sm mb-1', style: { padding: 0 } }, [label, opts.required ? el('span', { style: { color: 'var(--red)' } }, [' *']) : null]),
    el('div', { class: 'field' }, [node]),
  ]);
}
function kvEditor(label, initial, onChange) {
  const rows = [...initial];
  const container = el('div', {});
  function draw() {
    container.innerHTML = '';
    container.appendChild(el('div', { class: 'label-sm mb-1' }, [label]));
    rows.forEach((row, i) => {
      const k = mkInput(row.key, true);
      const v = mkInput(row.value, true);
      k.oninput = () => { rows[i].key = k.value; onChange(rows); };
      v.oninput = () => { rows[i].value = v.value; onChange(rows); };
      container.appendChild(el('div', { class: 'grid gap-2 mb-1', style: { gridTemplateColumns: '1fr 1fr 28px' } }, [
        el('div', { class: 'field h-8' }, [k]),
        el('div', { class: 'field h-8' }, [v]),
        el('button', { class: 'btn btn-ghost btn-icon', onclick: (e) => { e.preventDefault(); rows.splice(i, 1); onChange(rows); draw(); } }, [el('i', { class: 'ph ph-x text-[12px]' })]),
      ]));
    });
    container.appendChild(el('button', { class: 'btn btn-ghost btn-sm', onclick: (e) => { e.preventDefault(); rows.push({ key: '', value: '' }); onChange(rows); draw(); } }, [el('i', { class: 'ph ph-plus text-[11px]' }), 'Add row']));
  }
  draw();
  return container;
}
function arrayEditor(label, initial, onChange) {
  const rows = [...initial];
  const container = el('div', {});
  function draw() {
    container.innerHTML = '';
    container.appendChild(el('div', { class: 'label-sm mb-1' }, [label]));
    rows.forEach((val, i) => {
      const input = mkInput(val, true);
      input.oninput = () => { rows[i] = input.value; onChange(rows); };
      container.appendChild(el('div', { class: 'grid gap-2 mb-1', style: { gridTemplateColumns: '1fr 28px' } }, [
        el('div', { class: 'field h-8' }, [input]),
        el('button', { class: 'btn btn-ghost btn-icon', onclick: (e) => { e.preventDefault(); rows.splice(i, 1); onChange(rows); draw(); } }, [el('i', { class: 'ph ph-x text-[12px]' })]),
      ]));
    });
    container.appendChild(el('button', { class: 'btn btn-ghost btn-sm', onclick: (e) => { e.preventDefault(); rows.push(''); onChange(rows); draw(); } }, [el('i', { class: 'ph ph-plus text-[11px]' }), 'Add']));
  }
  draw();
  return container;
}
