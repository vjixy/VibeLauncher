import { el, clear, escapeHtml } from '../utils.js';
import { state } from '../state.js';
import { toast } from '../ui.js';
import { api } from '../api.js';

let paletteOpen = false;
let activeIndex = 0;
let items = [];
let onExecute = null;

export function openPalette(ctx) {
  if (paletteOpen) return;
  paletteOpen = true;
  const root = document.getElementById('paletteRoot');

  const input = document.createElement('input');
  input.placeholder = 'Search or type a command…';
  input.autofocus = true;

  const resultsContainer = el('div', { class: 'palette-results' });
  const countPill = el('span', { class: 'pill pill-sm mono', style: { color: 'var(--text-2)' } }, ['0 results']);

  function close() {
    paletteOpen = false;
    clear(root);
    document.removeEventListener('keydown', onKey);
  }

  onExecute = (item) => {
    if (!item) return;
    close();
    item.run(ctx);
  };

  function onKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); activeIndex = Math.min(items.length - 1, activeIndex + 1); rerender(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); activeIndex = Math.max(0, activeIndex - 1); rerender(); }
    else if (e.key === 'Enter') { e.preventDefault(); onExecute(items[activeIndex]); }
  }
  document.addEventListener('keydown', onKey);

  async function updateResults() {
    const q = input.value.trim();
    items = await buildItems(q, ctx);
    activeIndex = 0;
    rerender();
  }

  function rerender() {
    resultsContainer.innerHTML = '';
    countPill.textContent = `${items.length} result${items.length !== 1 ? 's' : ''}`;
    if (items.length === 0) {
      resultsContainer.appendChild(el('div', { class: 'text-[12.5px] text-center py-8', style: { color: 'var(--text-2)' } }, ['No matches. Try another query.']));
      return;
    }
    let lastSection = null;
    items.forEach((item, i) => {
      if (item.section && item.section !== lastSection) {
        resultsContainer.appendChild(el('div', { class: 'palette-section' }, [item.section]));
        lastSection = item.section;
      }
      const row = el('div', { class: `cmd-row ${i === activeIndex ? 'active' : ''}`, onclick: () => onExecute(item) }, [
        el('div', { class: 'ic', style: item.iconBg ? { background: item.iconBg, color: item.iconColor } : {} }, [el('i', { class: `ph ${item.icon}` })]),
        el('span', { html: highlight(item.label, input.value) }),
        item.sub ? el('span', { class: 'sub' }, [item.sub]) : null,
        item.keys ? el('div', { class: 'kbds' }, item.keys.map(k => el('span', { class: 'kbd' }, [k]))) : null,
      ]);
      resultsContainer.appendChild(row);
    });
  }

  input.addEventListener('input', updateResults);

  root.appendChild(el('div', { class: 'palette-backdrop', onclick: (e) => { if (e.target.classList.contains('palette-backdrop')) close(); } }, [
    el('div', { class: 'palette' }, [
      el('div', { class: 'palette-input' }, [
        el('i', { class: 'ph ph-magnifying-glass text-[15px]', style: { color: 'var(--text-2)' } }),
        input,
        countPill,
        el('button', { class: 'btn btn-ghost btn-icon', onclick: close, style: { height: '28px', width: '28px' } }, [el('i', { class: 'ph ph-x text-[12px]' })]),
      ]),
      resultsContainer,
      el('div', { class: 'palette-footer' }, [
        el('div', { class: 'hints' }, [
          el('span', {}, [el('span', { class: 'kbd' }, ['↑']), el('span', { class: 'kbd' }, ['↓']), ' navigate']),
          el('span', {}, [el('span', { class: 'kbd' }, ['↵']), ' run']),
          el('span', {}, [el('span', { class: 'kbd' }, ['esc']), ' close']),
        ]),
        el('span', { class: 'mono' }, ['⌘K']),
      ]),
    ]),
  ]));

  updateResults();
  setTimeout(() => input.focus(), 40);
}

function highlight(label, query) {
  const q = query.trim();
  if (!q) return escapeHtml(label);
  const safe = escapeHtml(label);
  const re = new RegExp(`(${q.split('').map(c => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*?')})`, 'i');
  return safe.replace(re, '<mark>$1</mark>');
}

async function buildItems(q, ctx) {
  const items = [];
  const query = q.toLowerCase();
  const match = (s) => !query || (typeof s === 'string' && s.toLowerCase().includes(query));

  // Quick actions
  const quickActions = [
    { section: 'Actions', label: 'New project', sub: 'launcher', icon: 'ph-folder-plus', keys: ['⌘', 'N'], run: (c) => c.emit('new-project') },
    { section: 'Actions', label: 'New prompt', sub: 'prompts', icon: 'ph-chat-circle-dots', keys: ['⌘', 'P'], run: (c) => c.emit('new-prompt') },
    { section: 'Actions', label: 'Connect MCP server', sub: 'mcp', icon: 'ph-plugs', keys: ['⌘', '⇧', 'M'], run: (c) => c.emit('new-mcp') },
    { section: 'Actions', label: 'Import markdown', sub: 'markdown', icon: 'ph-file-arrow-down', keys: ['⌘', 'I'], run: (c) => c.emit('import-markdown') },
    { section: 'Actions', label: 'Open settings', sub: 'preferences', icon: 'ph-gear-six', keys: ['⌘', ','], run: (c) => c.navigate('settings') },
    { section: 'Actions', label: 'Toggle theme', sub: 'dark ⇄ light', icon: 'ph-moon', run: (c) => c.toggleTheme() },
  ];
  const visible = quickActions.filter(a => match(a.label) || match(a.sub));
  items.push(...visible);

  // Projects
  for (const p of state.projects) {
    if (match(p.name) || match(p.path)) {
      items.push({
        section: 'Projects',
        label: p.name,
        sub: p.path || '',
        icon: 'ph-rocket',
        iconBg: 'var(--accent-soft)', iconColor: 'var(--accent-hover)',
        run: (c) => { c.navigate('launcher'); c.openProject(p.id); },
      });
      if ((p.commands || []).length > 0 && (!query || match('run') || match(p.name))) {
        items.push({
          section: 'Projects',
          label: `Run ${p.commands[0].name} in ${p.name}`,
          sub: `${p.commands[0].cmd}`,
          icon: 'ph-play',
          iconBg: 'var(--green-soft)', iconColor: 'var(--green)',
          run: (c) => c.runCommand(p.id, 0),
        });
      }
    }
  }

  // MCP servers + tools
  for (const s of state.mcpServers) {
    if (match(s.name) || match(s.url) || match(s.command)) {
      items.push({
        section: 'MCP',
        label: `Open ${s.name}`,
        sub: `${s.transport} · ${s.lastStatus}`,
        icon: 'ph-plugs',
        iconBg: 'var(--accent-soft)', iconColor: 'var(--accent-hover)',
        run: (c) => { state.mcp.selectedServerId = s.id; c.navigate('mcp'); },
      });
    }
    for (const t of (s.tools || [])) {
      if (match(t.name) || match(t.description)) {
        items.push({
          section: 'MCP',
          label: `Run tool: ${s.name} ▸ ${t.name}`,
          sub: (t.description || '').slice(0, 60),
          icon: 'ph-wrench',
          keys: ['⌘', '↵'],
          run: (c) => { state.mcp.selectedServerId = s.id; state.mcp.selectedTool = t.name; c.navigate('mcp'); },
        });
      }
    }
  }

  // Prompts
  for (const p of state.prompts) {
    if (match(p.title) || match(p.description)) {
      items.push({
        section: 'Prompts',
        label: `Copy: ${p.title}`,
        sub: `${p.format}${(p.tags || []).length ? ' · ' + p.tags.slice(0, 3).join(', ') : ''}`,
        icon: 'ph-chat-circle-text',
        iconBg: 'var(--cyan-soft)', iconColor: 'var(--cyan)',
        run: async (c) => {
          const text = p.format === 'text' ? p.template : (p.messages || []).map(m => `${m.role}: ${m.content}`).join('\n\n');
          await navigator.clipboard?.writeText(text);
          toast('Prompt copied');
        },
      });
    }
  }

  // Markdown
  for (const f of state.markdownFiles) {
    if (match(f.title) || match(f.filename) || match(f.excerpt)) {
      items.push({
        section: 'Markdown',
        label: f.title,
        sub: `${f.filename} · ${(f.size / 1024).toFixed(1)} KB`,
        icon: 'ph-file-text',
        iconBg: 'var(--amber-soft)', iconColor: 'var(--amber)',
        run: (c) => { state.markdown.selectedId = f.id; c.navigate('markdown'); },
      });
    }
  }

  return items.slice(0, 40);
}
