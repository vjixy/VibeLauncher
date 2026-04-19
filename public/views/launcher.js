import { el, mount, timeAgo, escapeHtml } from '../utils.js';
import { state, anyRunning, isRunning, firstRunning, getProject } from '../state.js';
import { renderSidebar, renderHeader, panelBlock, iconRow, logoTile, colorForIndex, formatHeaderTime } from '../chrome.js';
import { commandPillClass } from './dashboard.js';
import { openDrawer, closeDrawer, confirmDialog, toast } from '../ui.js';
import { api } from '../api.js';

export function renderLauncher(ctx) {
  const ls = state.launcher;

  renderSidebar({ ...ctx, contextPanel: buildSidebar(ctx) });
  renderHeader({
    title: ls.workspace === 'all' ? 'All Projects' : ls.workspace,
    subtitle: subtitleFor(ls),
    onPalette: ctx.onPalette,
    onSearch: (v) => { ls.search = v; rerender(ctx); },
    searchValue: ls.search,
    actions: [
      el('button', { class: 'btn btn-primary', onclick: () => ctx.emit('new-project') }, [
        el('i', { class: 'ph ph-plus text-[13px]' }), 'New Project',
      ]),
    ],
  });

  const content = document.getElementById('appContent');
  const projects = filterProjects();

  const filterBar = el('div', { class: 'flex items-center gap-2 mb-5' }, [
    el('span', { class: 'label-sm' }, ['Filter:']),
    filterPill('all', 'All'),
    filterPill('running', 'Running', 'dot dot-green pulse'),
    filterPill('pinned', 'Pinned', 'ph-fill ph-star', 'var(--amber)'),
    el('span', { class: 'ml-auto text-[11.5px]', style: { color: 'var(--text-2)' } }, [`Showing ${projects.length} of ${state.projects.length}`]),
  ]);

  if (projects.length === 0) {
    mount(content, el('section', { style: { padding: '24px' } }, [
      filterBar,
      el('div', { class: 'card empty-state' }, [
        el('div', { class: 'ic' }, [el('i', { class: 'ph-fill ph-rocket' })]),
        el('h3', {}, ['No projects yet']),
        el('p', {}, ['Click "New Project" to add your first vibe-coded folder.']),
        el('button', { class: 'btn btn-primary mt-2', onclick: () => ctx.emit('new-project') }, [
          el('i', { class: 'ph ph-plus' }), 'New Project',
        ]),
      ]),
    ]));
    return;
  }

  mount(content, el('section', { style: { padding: '24px' } }, [
    filterBar,
    ls.view === 'grid'
      ? el('div', { class: 'grid grid-cols-3 gap-3' }, projects.map(p => projectCard(p, ctx)))
      : projectList(projects, ctx),
  ]));

  function filterPill(id, label, dotClass, dotColor) {
    const active = ls.filter === id;
    return el('button', {
      class: `pill ${active ? 'pill-accent' : ''}`,
      onclick: () => { ls.filter = id; rerender(ctx); },
    }, [
      dotClass && dotClass.startsWith('dot') ? el('span', { class: dotClass, style: { width: '6px', height: '6px', boxShadow: 'none' } }) : null,
      dotClass && dotClass.startsWith('ph') ? el('i', { class: dotClass + ' text-[10px]', style: { color: dotColor } }) : null,
      label,
    ]);
  }
}

function subtitleFor(ls) {
  const n = state.projects.length;
  const pinned = state.projects.filter(p => p.pinned).length;
  const running = state.running.length;
  const parts = [`${n} project${n !== 1 ? 's' : ''}`];
  if (pinned > 0) parts.push(`${pinned} pinned`);
  if (running > 0) parts.push([el('span', { style: { color: 'var(--green)' } }, [`${running} running`])]);
  return interleave(parts, ' · ');
}

function interleave(arr, sep) {
  const out = [];
  arr.forEach((v, i) => { if (i > 0) out.push(sep); out.push(v); });
  return out;
}

function filterProjects() {
  const ls = state.launcher;
  const q = ls.search.trim().toLowerCase();
  let projects = [...state.projects];

  if (ls.workspace !== 'all') {
    projects = projects.filter(p => (p.categories || []).includes(ls.workspace));
  }
  if (ls.filter === 'running') projects = projects.filter(p => anyRunning(p.id));
  if (ls.filter === 'pinned') projects = projects.filter(p => p.pinned);

  if (q) {
    projects = projects.filter(p =>
      p.name.toLowerCase().includes(q) ||
      (p.path || '').toLowerCase().includes(q) ||
      (p.notes || '').toLowerCase().includes(q) ||
      (p.categories || []).some(c => c.toLowerCase().includes(q))
    );
  }

  if (ls.sort === 'name') projects.sort((a, b) => a.name.localeCompare(b.name));
  else if (ls.sort === 'pinned') projects.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
  else {
    projects.sort((a, b) => {
      const ra = anyRunning(a.id) ? 1 : 0;
      const rb = anyRunning(b.id) ? 1 : 0;
      if (ra !== rb) return rb - ra;
      const pa = a.pinned ? 1 : 0;
      const pb = b.pinned ? 1 : 0;
      if (pa !== pb) return pb - pa;
      const la = a.lastRunAt ? new Date(a.lastRunAt).getTime() : 0;
      const lb = b.lastRunAt ? new Date(b.lastRunAt).getTime() : 0;
      return lb - la;
    });
  }
  return projects;
}

function buildSidebar(ctx) {
  const ls = state.launcher;
  const workspaceCounts = new Map();
  state.projects.forEach(p => (p.categories || []).forEach(c => workspaceCounts.set(c, (workspaceCounts.get(c) || 0) + 1)));
  const categories = state.categories;

  const allRow = iconRow({ icon: 'ph-folders', label: 'All Projects', count: state.projects.length, active: ls.workspace === 'all', onclick: () => { ls.workspace = 'all'; rerender(ctx); } });

  return el('div', { class: 'flex flex-col gap-4 flex-1 min-h-0' }, [
    panelBlock('Workspaces',
      el('button', { onclick: async () => {
        const name = prompt('New workspace name');
        if (!name) return;
        try { await api.createCategory(name.trim()); await ctx.refresh(); } catch (e) { toast('Failed to create', { type: 'error' }); }
      } }, ['+ New']),
      [
        allRow,
        ...categories.map((c, i) => el('div', { class: 'flex items-center gap-1' }, [
          el('button', {
            class: `ws-row ${ls.workspace === c ? 'active' : ''}`, style: { width: '100%', border: 0, textAlign: 'left' },
            onclick: () => { ls.workspace = c; rerender(ctx); },
          }, [
            el('span', { class: 'ws-bar', style: { background: colorForIndex(i) } }),
            el('span', { class: 'truncate-1' }, [c]),
            el('span', { class: 'count' }, [String(workspaceCounts.get(c) || 0)]),
          ]),
        ])),
      ]
    ),
    panelBlock('View', null, [
      el('div', { class: 'seg', style: { margin: '0 8px' } }, [
        el('button', { class: ls.view === 'grid' ? 'active' : '', onclick: () => { ls.view = 'grid'; rerender(ctx); } }, [
          el('i', { class: 'ph-fill ph-squares-four text-[12px]' }), 'Grid',
        ]),
        el('button', { class: ls.view === 'list' ? 'active' : '', onclick: () => { ls.view = 'list'; rerender(ctx); } }, [
          el('i', { class: 'ph ph-list text-[12px]' }), 'List',
        ]),
      ]),
    ]),
    panelBlock('Sort by', null, [
      el('div', { class: 'field', style: { margin: '0 8px', height: '32px' } }, [
        el('i', { class: 'ph ph-sort-ascending text-[13px]', style: { color: 'var(--text-2)' } }),
        el('select', { onchange: (e) => { state.launcher.sort = e.target.value; rerender(ctx); }, value: state.launcher.sort }, [
          el('option', { value: 'recent', selected: state.launcher.sort === 'recent' }, ['Recently run']),
          el('option', { value: 'name', selected: state.launcher.sort === 'name' }, ['Name']),
          el('option', { value: 'pinned', selected: state.launcher.sort === 'pinned' }, ['Pinned first']),
        ]),
      ]),
    ]),
  ]);
}

function projectCard(p, ctx) {
  const running = firstRunning(p.id);
  const hasCommands = (p.commands || []).length > 0;

  const card = el('div', { class: `card card-hover proj-card ${running ? 'running' : ''}` }, [
    el('i', { class: 'ph ph-dots-six-vertical drag-handle text-[14px]' }),
    el('div', { class: 'flex items-start gap-3' }, [
      logoTile(p.name, 40, p.id),
      el('div', { class: 'flex-1 min-w-0' }, [
        el('div', { class: 'flex items-center gap-1.5' }, [
          el('span', { class: 'text-[15px] font-semibold truncate-1', style: { color: 'var(--text-0)' } }, [p.name]),
          running ? el('span', { class: 'pill pill-sm pill-running' }, [
            el('span', { class: 'dot dot-green pulse', style: { width: '5px', height: '5px' } }),
            'running',
          ]) : null,
        ]),
        el('div', { class: 'text-[11px] mono truncate-1', style: { color: 'var(--text-2)' } }, [p.path || '(no path)']),
      ]),
      el('button', {
        class: `star-btn ${p.pinned ? 'on' : ''}`,
        onclick: async (e) => { e.stopPropagation(); await api.updateProject(p.id, { ...p, pinned: !p.pinned }); await ctx.refresh(); },
        title: p.pinned ? 'Unpin' : 'Pin',
      }, [el('i', { class: `${p.pinned ? 'ph-fill' : 'ph'} ph-star text-[14px]` })]),
    ]),
    (p.categories || []).length > 0 ? el('div', { class: 'mt-3 flex items-center gap-1.5 flex-wrap' },
      p.categories.slice(0, 2).map(c => el('span', { class: 'tag' }, [c])).concat(p.categories.length > 2 ? [el('span', { class: 'tag', style: { color: 'var(--text-2)' } }, [`+${p.categories.length - 2}`])] : [])
    ) : null,
    (p.commands || []).length > 0 ? el('div', { class: 'mt-3 flex items-center gap-1.5 flex-wrap' },
      p.commands.slice(0, 3).map((c, i) => {
        const runThis = isRunning(p.id, i);
        return el('button', {
          class: `pill pill-sm ${commandPillClass(c.name)}`,
          style: { cursor: 'pointer' },
          title: runThis ? 'Stop' : `Run: ${c.cmd}`,
          onclick: (e) => { e.stopPropagation(); runThis ? ctx.stopCommand(p.id, i, c.name) : ctx.runCommand(p.id, i); },
        }, [
          runThis ? el('span', { class: 'dot dot-green pulse', style: { width: '5px', height: '5px' } }) : null,
          el('span', { class: 'mono' }, [c.name]),
        ]);
      })
    ) : null,
    p.notes ? el('div', { class: 'truncate-2 mt-3 text-[12px]', style: { color: 'var(--text-2)' } }, [
      el('i', { class: 'ph ph-note text-[12px] mr-1', style: { color: 'var(--text-3)' } }),
      p.notes,
    ]) : null,
    el('div', { class: 'mt-3 pt-3 border-t flex items-center justify-between gap-2', style: { borderColor: 'var(--line-1)' } }, [
      el('span', { class: 'text-[11px] truncate-1 min-w-0', style: { color: 'var(--text-2)' } }, [
        running ? `Running · ${timeAgo(running.startedAt)}` : p.lastRunAt ? `Last run · ${timeAgo(p.lastRunAt)}` : 'Not run yet',
      ]),
      el('div', { class: 'flex items-center gap-1 actions flex-none' }, [
        hasCommands && !running ? el('button', { class: 'btn btn-sm btn-secondary', onclick: (e) => { e.stopPropagation(); ctx.runCommand(p.id, 0); } }, [
          el('i', { class: 'ph ph-play text-[12px]', style: { color: 'var(--green)' } }), 'Run',
        ]) : null,
        running ? el('button', { class: 'btn btn-sm btn-secondary', style: { color: 'var(--red)', borderColor: 'rgba(226,106,106,0.25)' }, onclick: (e) => { e.stopPropagation(); ctx.stopCommand(p.id, running.commandIndex, p.commands?.[running.commandIndex]?.name || ''); } }, [
          el('i', { class: 'ph-fill ph-stop text-[11px]' }), 'Stop',
        ]) : null,
        el('button', { class: 'btn btn-sm btn-ghost btn-icon', title: 'Open in IDE', onclick: (e) => { e.stopPropagation(); api.openIde(p.id); toast(`Opening in ${p.ide}`); } }, [el('i', { class: 'ph ph-code text-[13px]' })]),
        el('button', { class: 'btn btn-sm btn-ghost btn-icon', title: 'Open terminal', onclick: (e) => { e.stopPropagation(); api.openTerminal(p.id); } }, [el('i', { class: 'ph ph-terminal text-[13px]' })]),
        el('button', { class: 'btn btn-sm btn-ghost btn-icon', title: 'Edit', onclick: (e) => { e.stopPropagation(); ctx.emit('edit-project', p); } }, [el('i', { class: 'ph ph-pencil-simple text-[13px]' })]),
        el('button', { class: 'btn btn-sm btn-ghost btn-icon', title: 'More', onclick: (e) => { e.stopPropagation(); ctx.openProject(p.id); } }, [el('i', { class: 'ph ph-dots-three text-[13px]' })]),
      ]),
    ]),
  ]);

  card.addEventListener('click', () => ctx.openProject(p.id));
  return card;
}

function projectList(projects, ctx) {
  return el('div', {}, [
    el('div', { class: 'list-head' }, [
      el('div', {}),
      el('div', {}, ['Project']),
      el('div', {}, ['Commands']),
      el('div', {}, ['Categories']),
      el('div', {}, ['Last run']),
      el('div', {}),
    ]),
    el('div', { class: 'flex flex-col gap-0.5' }, projects.map(p => {
      const running = firstRunning(p.id);
      return el('div', { class: `list-row ${running ? 'running' : ''}`, onclick: () => ctx.openProject(p.id) }, [
        logoTile(p.name, 32, p.id),
        el('div', { class: 'min-w-0' }, [
          el('div', { class: 'flex items-center gap-1.5' }, [
            el('span', { class: 'text-[13.5px] font-semibold truncate-1' }, [p.name]),
            p.pinned ? el('i', { class: 'ph-fill ph-star text-[11px]', style: { color: 'var(--amber)' } }) : null,
            running ? el('span', { class: 'pill pill-sm pill-running' }, ['running']) : null,
          ]),
          el('div', { class: 'text-[11px] mono truncate-1', style: { color: 'var(--text-2)' } }, [p.path || '']),
        ]),
        el('div', { class: 'flex items-center gap-1 flex-wrap' },
          (p.commands || []).slice(0, 3).map((c, i) => el('span', { class: `pill pill-sm ${commandPillClass(c.name)}` }, [el('span', { class: 'mono' }, [c.name])]))
        ),
        el('div', { class: 'flex items-center gap-1 flex-wrap' },
          (p.categories || []).slice(0, 3).map(c => el('span', { class: 'tag' }, [c]))
        ),
        el('div', { class: 'text-[12px]', style: { color: 'var(--text-1)' } }, [p.lastRunAt ? timeAgo(p.lastRunAt) : '—']),
        el('button', { class: 'btn btn-ghost btn-icon', onclick: (e) => { e.stopPropagation(); ctx.openProject(p.id); } }, [el('i', { class: 'ph ph-dots-three-vertical text-[12px]' })]),
      ]);
    })),
  ]);
}

function rerender(ctx) {
  renderLauncher(ctx);
}

/* ===== Project detail drawer ===== */
export async function openProjectDrawer(projectId, ctx) {
  const p = getProject(projectId);
  if (!p) return;
  state.launcher.selectedId = projectId;

  let health = null;
  try { health = await api.projectHealth(projectId); } catch {}

  const linkedPrompts = state.prompts.filter(x => (p.linkedPrompts || []).includes(x.id));
  const linkedMarkdown = state.markdownFiles.filter(x => (p.linkedMarkdown || []).includes(x.id));

  const running = firstRunning(p.id);

  const tabs = ['Overview', 'Commands', 'Prompts', 'Markdown', 'Notes'];
  let activeTab = 'Commands';

  const drawer = openDrawer({
    onClose: () => { state.launcher.selectedId = null; },
    content: el('div', { class: 'flex flex-col', style: { height: '100vh' } }, [
      // header
      el('div', { style: { padding: '20px 20px 16px', borderBottom: '1px solid var(--line-1)' } }, [
        el('div', { class: 'flex items-center justify-between mb-4' }, [
          el('div', { class: 'flex items-center gap-1' }, [
            el('button', { class: 'btn btn-ghost btn-icon', onclick: () => navigateProject(ctx, p.id, -1) }, [el('i', { class: 'ph ph-caret-up text-[13px]' })]),
            el('button', { class: 'btn btn-ghost btn-icon', onclick: () => navigateProject(ctx, p.id, 1) }, [el('i', { class: 'ph ph-caret-down text-[13px]' })]),
            el('span', { class: 'text-[11.5px] ml-2', style: { color: 'var(--text-2)' } }, [`${state.projects.findIndex(x => x.id === p.id) + 1} of ${state.projects.length}`]),
          ]),
          el('div', { class: 'flex items-center gap-1' }, [
            el('button', { class: 'btn btn-ghost btn-icon', title: 'Close', onclick: closeDrawer }, [el('i', { class: 'ph ph-x text-[14px]' })]),
          ]),
        ]),
        el('div', { class: 'flex items-start gap-4' }, [
          logoTile(p.name, 56, p.id),
          el('div', { class: 'flex-1 min-w-0' }, [
            el('div', { class: 'flex items-center gap-2' }, [
              el('h2', { class: 'text-[20px] font-semibold tracking-tight truncate-1', style: { margin: 0 } }, [p.name]),
              running ? el('span', { class: 'pill pill-sm pill-running' }, [
                el('span', { class: 'dot dot-green pulse', style: { width: '5px', height: '5px' } }), 'running',
              ]) : null,
              p.pinned ? el('i', { class: 'ph-fill ph-star text-[14px]', style: { color: 'var(--amber)' } }) : null,
            ]),
            el('div', { class: 'mt-1 flex items-center gap-2' }, [
              el('span', { class: 'text-[12px] mono truncate-1', style: { color: 'var(--text-1)' } }, [p.path || '(no path)']),
              p.path ? el('button', { class: 'btn btn-ghost btn-icon', style: { height: '24px', width: '24px' }, title: 'Copy', onclick: () => { navigator.clipboard?.writeText(p.path); toast('Path copied'); } }, [el('i', { class: 'ph ph-copy text-[12px]' })]) : null,
            ]),
            (p.categories || []).length > 0 ? el('div', { class: 'mt-2 flex items-center gap-1.5 flex-wrap' },
              p.categories.map(c => el('span', { class: 'tag' }, [c]))
            ) : null,
          ]),
        ]),
        el('div', { class: 'mt-4 flex items-center gap-2' }, [
          el('button', { class: 'btn btn-primary', onclick: () => { api.openIde(p.id); toast(`Opening in ${p.ide}`); } }, [
            el('i', { class: 'ph ph-code text-[13px]' }), `Open in ${p.ide}`,
          ]),
          el('button', { class: 'btn btn-secondary', onclick: () => { api.openTerminal(p.id); } }, [
            el('i', { class: 'ph ph-terminal text-[13px]' }), 'Open Terminal',
          ]),
          el('button', { class: 'btn btn-ghost btn-icon ml-auto', title: 'Edit', onclick: () => { closeDrawer(); ctx.emit('edit-project', p); } }, [el('i', { class: 'ph ph-pencil-simple text-[14px]' })]),
          el('button', { class: 'btn btn-ghost btn-icon', title: 'Delete', onclick: async () => {
            const ok = await confirmDialog({ title: 'Delete project?', message: `This removes "${p.name}" from Vibe Launcher. Your files are left alone.`, confirmLabel: 'Delete', danger: true });
            if (!ok) return;
            await api.deleteProject(p.id);
            closeDrawer();
            await ctx.refresh();
          } }, [el('i', { class: 'ph ph-trash text-[14px]' })]),
        ]),
      ]),

      // tabs
      el('div', { class: 'tabs-row', id: 'drawerTabs' }, tabs.map(t =>
        el('div', { class: `tab ${activeTab === t ? 'active' : ''}`, onclick: () => { activeTab = t; renderBody(); } }, [
          t,
          ...(t === 'Commands' ? [el('span', { class: 'pill pill-sm ml-1' }, [String((p.commands || []).length)])] : []),
          ...(t === 'Prompts' ? [el('span', { class: 'pill pill-sm ml-1' }, [String(linkedPrompts.length)])] : []),
          ...(t === 'Markdown' ? [el('span', { class: 'pill pill-sm ml-1' }, [String(linkedMarkdown.length)])] : []),
        ])
      )),

      el('div', { class: 'flex-1 overflow-y-auto', id: 'drawerBody', style: { padding: '20px' } }, []),

      el('div', { class: 'px-5 py-3 border-t flex items-center justify-between text-[11.5px]', style: { borderColor: 'var(--line-1)', color: 'var(--text-2)' } }, [
        el('span', {}, ['Click a command to run · ⌘↵ to run highlighted']),
        el('span', { class: 'mono' }, [`id: ${p.id.slice(-8)}`]),
      ]),
    ]),
  });

  function renderBody() {
    // update tab styles
    drawer.drawer.querySelectorAll('#drawerTabs .tab').forEach((tab) => {
      tab.classList.toggle('active', tab.textContent.startsWith(activeTab));
    });
    const body = drawer.drawer.querySelector('#drawerBody');
    mount(body, ...bodyContent());
  }

  function bodyContent() {
    if (activeTab === 'Overview') return overviewTab(p, health);
    if (activeTab === 'Commands') return commandsTab(p, ctx);
    if (activeTab === 'Prompts') return promptsTab(p, ctx);
    if (activeTab === 'Markdown') return markdownTab(p, ctx);
    if (activeTab === 'Notes') return notesTab(p, ctx);
    return [];
  }

  renderBody();
}

function navigateProject(ctx, id, direction) {
  const i = state.projects.findIndex(p => p.id === id);
  const next = state.projects[(i + direction + state.projects.length) % state.projects.length];
  if (next && next.id !== id) {
    closeDrawer();
    openProjectDrawer(next.id, ctx);
  }
}

function overviewTab(p, health) {
  return [
    el('div', { class: 'card', style: { padding: '16px' } }, [
      el('div', { class: 'grid grid-cols-3 gap-4' }, [
        kv('Last run', p.lastRunAt ? timeAgo(p.lastRunAt) : 'Never'),
        kv('Times run', String(p.runCount || 0)),
        kv('IDE', p.ide || 'code'),
      ]),
      health ? el('div', { class: 'mt-3 pt-3 border-t flex items-center justify-between', style: { borderColor: 'var(--line-1)' } }, [
        el('div', { class: 'flex items-center gap-3 text-[12px]' }, [
          healthCheck(health.pathExists, 'Path exists'),
          healthCheck(!!p.ide, `IDE ${p.ide}`),
          healthCheck(health.hasPackageJson, 'package.json'),
        ]),
      ]) : null,
    ]),
  ];
}

function kv(label, value) {
  return el('div', {}, [
    el('div', { class: 'text-[11px]', style: { color: 'var(--text-2)' } }, [label]),
    el('div', { class: 'text-[13px] font-semibold mt-0.5' }, [value]),
  ]);
}

function healthCheck(ok, label) {
  return el('span', { class: 'flex items-center gap-1.5', style: { color: 'var(--text-1)' } }, [
    el('i', { class: `ph-fill ${ok ? 'ph-check-circle' : 'ph-x-circle'} text-[13px]`, style: { color: ok ? 'var(--green)' : 'var(--red)' } }),
    label,
  ]);
}

function commandsTab(p, ctx) {
  if ((p.commands || []).length === 0) {
    return [el('div', { class: 'empty-state' }, [
      el('div', { class: 'ic' }, [el('i', { class: 'ph ph-terminal' })]),
      el('h3', {}, ['No commands']),
      el('p', {}, ['Edit the project to add run commands.']),
    ])];
  }
  return (p.commands || []).map((c, i) => {
    const runThis = isRunning(p.id, i);
    const tint = commandPillClass(c.name);
    return el('div', { class: `card cmd-row-compact ${runThis ? 'running' : ''}`, style: { marginBottom: '10px' } }, [
      el('span', { class: `pill pill-sm ${tint}` }, [el('span', { class: 'mono' }, [c.name])]),
      el('div', { class: 'flex-1 min-w-0' }, [
        el('div', { class: 'text-[13.5px] font-semibold' }, [c.name]),
        el('div', { class: 'text-[11px] mono truncate-1', style: { color: 'var(--text-2)' } }, [c.cmd]),
      ]),
      runThis ? el('span', { class: 'pill pill-sm pill-running' }, [
        el('span', { class: 'dot dot-green pulse', style: { width: '5px', height: '5px' } }), 'running',
      ]) : null,
      runThis
        ? el('button', { class: 'btn btn-sm btn-secondary', style: { color: 'var(--red)', borderColor: 'rgba(226,106,106,0.25)' }, onclick: () => ctx.stopCommand(p.id, i, c.name) }, [
            el('i', { class: 'ph-fill ph-stop text-[11px]' }), 'Stop',
          ])
        : el('button', { class: 'btn btn-sm btn-secondary', onclick: () => ctx.runCommand(p.id, i) }, [
            el('i', { class: 'ph-fill ph-play text-[11px]', style: { color: 'var(--green)' } }), 'Run',
          ]),
    ]);
  });
}

function promptsTab(p, ctx) {
  const linked = state.prompts.filter(x => (p.linkedPrompts || []).includes(x.id));
  return [
    el('div', { class: 'flex items-center justify-between mb-3' }, [
      el('div', { class: 'text-[12px]', style: { color: 'var(--text-2)' } }, [`${linked.length} linked prompts`]),
      el('button', { class: 'btn btn-sm btn-secondary', onclick: async () => {
        const name = prompt('Prompt title to link (partial match):');
        if (!name) return;
        const match = state.prompts.find(x => x.title.toLowerCase().includes(name.toLowerCase()));
        if (!match) return toast('Not found', { type: 'error' });
        const next = [...new Set([...(p.linkedPrompts || []), match.id])];
        await api.linkProject(p.id, { linkedPrompts: next, linkedMarkdown: p.linkedMarkdown });
        await ctx.refresh();
        toast(`Linked: ${match.title}`);
      } }, [el('i', { class: 'ph ph-link text-[12px]' }), 'Attach prompt']),
    ]),
    linked.length === 0
      ? el('div', { class: 'empty-state' }, [
          el('div', { class: 'ic', style: { background: 'var(--cyan-soft)', color: 'var(--cyan)' } }, [el('i', { class: 'ph ph-chat-circle-text' })]),
          el('p', {}, ['No prompts linked yet. Attach one to keep it handy here.']),
        ])
      : el('div', { class: 'flex flex-col gap-2' }, linked.map(pr => promptLinkRow(pr, p, ctx))),
  ];
}

function promptLinkRow(pr, project, ctx) {
  return el('div', { class: 'card', style: { padding: '10px 12px' } }, [
    el('div', { class: 'flex items-center gap-2' }, [
      el('span', { class: `pill pill-sm ${pr.format === 'chat' ? 'fmt-chat' : 'fmt-text'}`, style: { fontFamily: 'var(--font-mono)' } }, [pr.format.toUpperCase()]),
      el('span', { class: 'text-[13px] font-semibold flex-1 min-w-0 truncate-1' }, [pr.title]),
      el('button', { class: 'btn btn-ghost btn-icon', title: 'Unlink', onclick: async () => {
        const next = (project.linkedPrompts || []).filter(id => id !== pr.id);
        await api.linkProject(project.id, { linkedPrompts: next, linkedMarkdown: project.linkedMarkdown });
        await ctx.refresh();
        toast('Unlinked');
      } }, [el('i', { class: 'ph ph-link-break text-[13px]' })]),
    ]),
    pr.description ? el('div', { class: 'text-[12px] truncate-2 mt-1', style: { color: 'var(--text-2)' } }, [pr.description]) : null,
  ]);
}

function markdownTab(p, ctx) {
  const linked = state.markdownFiles.filter(x => (p.linkedMarkdown || []).includes(x.id));
  return [
    el('div', { class: 'flex items-center justify-between mb-3' }, [
      el('div', { class: 'text-[12px]', style: { color: 'var(--text-2)' } }, [`${linked.length} linked markdown docs`]),
      el('button', { class: 'btn btn-sm btn-secondary', onclick: async () => {
        const name = prompt('Markdown title/filename to link (partial match):');
        if (!name) return;
        const match = state.markdownFiles.find(x => x.title.toLowerCase().includes(name.toLowerCase()) || x.filename.toLowerCase().includes(name.toLowerCase()));
        if (!match) return toast('Not found', { type: 'error' });
        const next = [...new Set([...(p.linkedMarkdown || []), match.id])];
        await api.linkProject(p.id, { linkedMarkdown: next, linkedPrompts: p.linkedPrompts });
        await ctx.refresh();
        toast(`Linked: ${match.title}`);
      } }, [el('i', { class: 'ph ph-link text-[12px]' }), 'Attach file']),
    ]),
    linked.length === 0
      ? el('div', { class: 'empty-state' }, [
          el('div', { class: 'ic', style: { background: 'var(--amber-soft)', color: 'var(--amber)' } }, [el('i', { class: 'ph ph-file-text' })]),
          el('p', {}, ['No markdown attached. Attach a spec or cheatsheet.']),
        ])
      : el('div', { class: 'flex flex-col gap-2' }, linked.map(md => el('div', { class: 'card', style: { padding: '10px 12px' } }, [
          el('div', { class: 'flex items-center gap-2' }, [
            el('i', { class: 'ph ph-file-text text-[14px]', style: { color: 'var(--text-2)' } }),
            el('span', { class: 'text-[13px] font-semibold flex-1 min-w-0 truncate-1' }, [md.title]),
            el('span', { class: 'text-[11px] mono', style: { color: 'var(--text-2)' } }, [md.filename]),
            el('button', { class: 'btn btn-ghost btn-icon', title: 'Unlink', onclick: async () => {
              const next = (p.linkedMarkdown || []).filter(id => id !== md.id);
              await api.linkProject(p.id, { linkedMarkdown: next, linkedPrompts: p.linkedPrompts });
              await ctx.refresh();
            } }, [el('i', { class: 'ph ph-link-break text-[13px]' })]),
          ]),
        ]))),
  ];
}

function notesTab(p, ctx) {
  const textarea = el('textarea', {
    placeholder: 'Add free-form notes for this project…',
    style: { width: '100%', minHeight: '240px', background: 'var(--bg-2)', border: '1px solid var(--line-1)', borderRadius: '8px', padding: '12px', color: 'var(--text-0)', fontFamily: 'var(--font-mono)', fontSize: '12.5px', resize: 'vertical' },
  });
  textarea.value = p.notes || '';
  let saveTimer;
  textarea.addEventListener('input', () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      await api.updateProject(p.id, { ...p, notes: textarea.value });
      await ctx.refresh();
      toast('Notes saved', { type: 'success', duration: 1400 });
    }, 700);
  });
  return [
    el('div', {}, [
      el('div', { class: 'label-sm mb-2' }, ['Notes']),
      textarea,
      el('div', { class: 'text-[11px] mt-2', style: { color: 'var(--text-2)' } }, ['Saves automatically after you stop typing.']),
    ]),
  ];
}
