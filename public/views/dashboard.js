import { el, mount, timeAgo, timeOfDayGreeting } from '../utils.js';
import { state, anyRunning, firstRunning } from '../state.js';
import { renderSidebar, renderHeader, panelBlock, iconRow, logoTile, formatHeaderTime } from '../chrome.js';
import { api } from '../api.js';
import { toast } from '../ui.js';

export function renderDashboard(ctx) {
  renderSidebar({
    ...ctx,
    contextPanel: buildSidebarContext(ctx),
  });
  renderHeader({
    title: 'Dashboard',
    subtitle: formatHeaderTime(),
    onSearch: () => {}, // search opens palette
    onPalette: ctx.onPalette,
    searchPlaceholder: 'Search projects, prompts, tools, or markdown…',
    actions: [
      el('button', { class: 'btn btn-secondary', onclick: () => ctx.emit('new-project') }, [
        el('i', { class: 'ph ph-plus text-[13px]' }),
        'New Project',
      ]),
    ],
  });

  const content = document.getElementById('appContent');
  const totals = computeTotals();
  const runningProjects = state.projects.filter(p => anyRunning(p.id));
  const pinned = state.projects.filter(p => p.pinned).slice(0, 3);
  const isEmpty = state.projects.length === 0 && state.mcpServers.length === 0 && state.prompts.length === 0 && state.markdownFiles.length === 0;

  if (isEmpty) {
    mount(content, emptyDashboard(ctx));
    return;
  }

  mount(content,
    el('section', { class: 'hero-wash', style: { padding: '24px' } }, [
      // Greeting
      el('div', { class: 'flex items-end justify-between mb-5' }, [
        el('div', {}, [
          el('h2', { class: 'text-[26px] font-semibold leading-tight tracking-tight', style: { color: 'var(--text-0)' } }, [
            `${timeOfDayGreeting()}.`,
          ]),
          el('p', { class: 'text-[13.5px] mt-1', style: { color: 'var(--text-1)' } }, greetingLine(totals, runningProjects)),
        ]),
      ]),

      // Stat cards
      el('div', { class: 'grid grid-cols-4 gap-3 mb-6' }, [
        statCard({
          label: 'Total projects',
          value: totals.projects,
          sub: `${totals.pinned} pinned`,
          icon: 'ph-folders',
        }),
        runningStatCard(totals, runningProjects),
        mcpStatCard(totals),
        promptsStatCard(totals),
      ]),

      // Middle: pinned + activity
      el('div', { class: 'grid grid-cols-3 gap-3 mb-6' }, [
        el('div', { class: 'col-span-2' }, [
          el('div', { class: 'flex items-center justify-between mb-2.5' }, [
            el('div', { class: 'flex items-center gap-2' }, [
              el('h3', { class: 'text-[14px] font-semibold', style: { color: 'var(--text-0)' } }, ['Pinned projects']),
              el('span', { class: 'text-[12px]', style: { color: 'var(--text-2)' } }, [`${pinned.length} of ${pinned.length}`]),
            ]),
            el('button', { class: 'btn btn-ghost btn-sm', onclick: () => ctx.navigate('launcher') }, [
              'View all',
              el('i', { class: 'ph ph-arrow-right text-[12px]' }),
            ]),
          ]),
          pinned.length === 0
            ? el('div', { class: 'card', style: { padding: '32px', textAlign: 'center', color: 'var(--text-2)', fontSize: '12.5px' } }, [
                'Pin a project by clicking the star on its card.',
              ])
            : el('div', { class: 'grid grid-cols-3 gap-3' }, pinned.map(p => pinnedCard(p, ctx))),
        ]),
        activityFeedCard(ctx),
      ]),

      // Quick actions + tip
      el('div', { class: 'grid grid-cols-3 gap-3' }, [
        el('div', { class: 'col-span-2' }, [
          el('div', { class: 'flex items-center justify-between mb-2.5' }, [
            el('h3', { class: 'text-[14px] font-semibold', style: { color: 'var(--text-0)' } }, ['Quick actions']),
            el('span', { class: 'text-[11.5px]', style: { color: 'var(--text-2)' } }, ['Shortcuts work anywhere']),
          ]),
          el('div', { class: 'grid grid-cols-4 gap-3' }, [
            quickAction({ icon: 'ph-folder-plus', color: 'var(--accent-hover)', bg: 'var(--accent-soft)', title: 'New Project', sub: 'Point to a folder, wire commands', keys: ['⌘', 'N'], onClick: () => ctx.emit('new-project') }),
            quickAction({ icon: 'ph-chat-circle-dots', color: 'var(--cyan)', bg: 'var(--cyan-soft)', title: 'New Prompt', sub: 'Text or chat, with variables', keys: ['⌘', 'P'], onClick: () => ctx.emit('new-prompt') }),
            quickAction({ icon: 'ph-plugs', color: 'var(--green)', bg: 'var(--green-soft)', title: 'Connect MCP', sub: 'HTTP, SSE, or stdio server', keys: ['⌘', '⇧', 'M'], onClick: () => ctx.emit('new-mcp') }),
            quickAction({ icon: 'ph-file-arrow-down', color: 'var(--amber)', bg: 'var(--amber-soft)', title: 'Import Markdown', sub: 'Drop .md files anywhere', keys: ['⌘', 'I'], onClick: () => ctx.emit('import-markdown') }),
          ]),
        ]),
        el('div', { class: 'flex flex-col gap-3' }, [
          todayCard(),
          tipCard(),
        ]),
      ]),
    ]),
  );
}

function buildSidebarContext(ctx) {
  const totals = computeTotals();
  return el('div', { class: 'flex flex-col gap-4' }, [
    panelBlock('At a glance', el('button', { class: 'muted', onclick: ctx.refresh }, ['refresh']), [
      el('div', { class: 'flex items-center gap-2 px-2 py-1.5 rounded-md' }, [
        el('span', { class: `dot ${totals.running > 0 ? 'dot-green pulse' : 'dot-gray'}` }),
        el('span', { class: 'text-[12.5px]', style: { color: 'var(--text-1)' } }, [`${totals.running} running now`]),
      ]),
      el('div', { class: 'flex items-center gap-2 px-2 py-1.5 rounded-md' }, [
        el('span', { class: `dot ${totals.mcpOffline > 0 ? 'dot-red' : 'dot-green'}` }),
        el('span', { class: 'text-[12.5px]', style: { color: 'var(--text-1)' } }, [
          totals.mcpOffline > 0 ? `${totals.mcpOffline} MCP offline` : `${totals.mcpOnline} MCP online`,
        ]),
      ]),
      el('div', { class: 'flex items-center gap-2 px-2 py-1.5 rounded-md' }, [
        el('span', { class: 'dot dot-amber' }),
        el('span', { class: 'text-[12.5px]', style: { color: 'var(--text-1)' } }, [`${totals.markdown} markdown docs`]),
      ]),
    ]),
    panelBlock('Pinned', null, state.projects.filter(p => p.pinned).slice(0, 5).map(p =>
      el('button', { class: 'nav-item', style: { width: '100%', border: 0, textAlign: 'left', height: '32px' }, onclick: () => { ctx.navigate('launcher'); ctx.openProject?.(p.id); } }, [
        logoTile(p.name, 20, p.id),
        el('span', { class: 'truncate-1' }, [p.name]),
        el('i', { class: 'ph-fill ph-star ml-auto text-[11px]', style: { color: 'var(--amber)' } }),
      ])
    )),
  ]);
}

function greetingLine(totals, runningProjects) {
  const parts = [];
  if (totals.running > 0) {
    const names = runningProjects.slice(0, 2).map(p => p.name).join(', ');
    parts.push(el('span', {}, ['You have ', el('span', { style: { color: 'var(--green)', fontWeight: 500 } }, [`${totals.running} ${totals.running === 1 ? 'project' : 'projects'} running`]), names ? ` (${names}). ` : '. ']));
  } else {
    parts.push('Nothing running right now. ');
  }
  parts.push(`${totals.projects} ${totals.projects === 1 ? 'project' : 'projects'}, ${totals.prompts} prompts, ${totals.markdown} markdown docs.`);
  return parts;
}

function computeTotals() {
  const projects = state.projects.length;
  const pinned = state.projects.filter(p => p.pinned).length;
  const running = state.running.length;
  const mcpOnline = state.mcpServers.filter(s => s.lastStatus === 'online').length;
  const mcpOffline = state.mcpServers.filter(s => s.lastStatus === 'offline').length;
  const mcp = state.mcpServers.length;
  const prompts = state.prompts.length;
  const favorites = state.prompts.filter(p => p.favorite).length;
  const markdown = state.markdownFiles.length;
  return { projects, pinned, running, mcpOnline, mcpOffline, mcp, prompts, favorites, markdown };
}

function statCard({ label, value, sub, icon }) {
  return el('div', { class: 'card', style: { padding: '16px', position: 'relative', overflow: 'hidden' } }, [
    el('div', { class: 'flex items-center justify-between' }, [
      el('span', { class: 'label-sm' }, [label]),
      icon ? el('i', { class: `ph ${icon} text-[14px]`, style: { color: 'var(--text-2)' } }) : null,
    ]),
    el('div', { class: 'flex items-end justify-between mt-2' }, [
      el('div', { class: 'flex items-baseline gap-2' }, [
        el('span', { class: 'text-[28px] font-semibold tracking-tight', style: { color: 'var(--text-0)' } }, [String(value)]),
        sub ? el('span', { class: 'text-[11.5px]', style: { color: 'var(--text-2)' } }, [sub]) : null,
      ]),
    ]),
  ]);
}

function runningStatCard(totals, runningProjects) {
  return el('div', { class: 'card', style: { padding: '16px', borderColor: totals.running > 0 ? 'rgba(78,201,160,0.22)' : '' } }, [
    el('div', { class: 'flex items-center justify-between' }, [
      el('span', { class: 'label-sm', style: { color: totals.running > 0 ? 'var(--green)' : '' } }, ['Running now']),
      totals.running > 0 ? el('span', { class: 'dot dot-green pulse' }) : el('span', { class: 'dot dot-gray' }),
    ]),
    el('div', { class: 'flex items-end justify-between mt-2' }, [
      el('div', { class: 'flex items-baseline gap-2' }, [
        el('span', { class: 'text-[28px] font-semibold tracking-tight', style: { color: 'var(--text-0)' } }, [String(totals.running)]),
        el('span', { class: 'text-[11.5px]', style: { color: 'var(--text-2)' } }, [`of ${totals.projects}`]),
      ]),
    ]),
    runningProjects.length > 0
      ? el('div', { class: 'mt-3 flex flex-col gap-1.5' }, runningProjects.slice(0, 3).map(p => {
          const run = firstRunning(p.id);
          const cmd = p.commands?.[run?.commandIndex];
          return el('div', { class: 'flex items-center gap-2 text-[12px]' }, [
            el('span', { class: 'dot dot-green', style: { width: '6px', height: '6px', boxShadow: 'none' } }),
            el('span', { class: 'truncate-1', style: { color: 'var(--text-1)' } }, [p.name]),
            el('span', { class: 'mono text-[10.5px] ml-auto', style: { color: 'var(--text-2)' } }, [run ? timeAgo(run.startedAt) : '']),
          ]);
        }))
      : null,
  ]);
}

function mcpStatCard(totals) {
  const all = state.mcpServers;
  const lastOffline = all.find(s => s.lastStatus === 'offline');
  return el('div', { class: 'card', style: { padding: '16px' } }, [
    el('div', { class: 'flex items-center justify-between' }, [
      el('span', { class: 'label-sm' }, ['MCP online']),
      el('i', { class: 'ph ph-plugs-connected text-[14px]', style: { color: 'var(--text-2)' } }),
    ]),
    el('div', { class: 'flex items-end justify-between mt-2' }, [
      el('div', { class: 'flex items-baseline gap-2' }, [
        el('span', { class: 'text-[28px] font-semibold tracking-tight', style: { color: 'var(--text-0)' } }, [String(totals.mcpOnline)]),
        el('span', { class: 'text-[11.5px]', style: { color: 'var(--text-2)' } }, [`of ${totals.mcp}`]),
      ]),
    ]),
    all.length > 0
      ? el('div', { class: 'mt-3 flex items-center gap-1.5' }, all.slice(0, 8).map(s =>
          el('span', { class: 'flex-1 h-1 rounded-full', style: { background: s.lastStatus === 'online' ? 'var(--green)' : s.lastStatus === 'offline' ? 'var(--red)' : 'var(--gray)' } })
        ))
      : null,
    lastOffline ? el('div', { class: 'mt-2 flex items-center gap-1.5 text-[11.5px]' }, [
      el('i', { class: 'ph ph-warning-circle text-[12px]', style: { color: 'var(--red)' } }),
      el('span', { style: { color: 'var(--text-1)' } }, [el('span', { class: 'mono' }, [lastOffline.name]), ' is offline']),
    ]) : null,
  ]);
}

function promptsStatCard(totals) {
  const tagCounts = new Map();
  state.prompts.forEach(p => (p.tags || []).forEach(t => tagCounts.set(t, (tagCounts.get(t) || 0) + 1)));
  const topTags = [...tagCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
  return el('div', { class: 'card', style: { padding: '16px' } }, [
    el('div', { class: 'flex items-center justify-between' }, [
      el('span', { class: 'label-sm' }, ['Prompts']),
      el('i', { class: 'ph ph-chat-circle-text text-[14px]', style: { color: 'var(--text-2)' } }),
    ]),
    el('div', { class: 'flex items-end justify-between mt-2' }, [
      el('div', { class: 'flex items-baseline gap-2' }, [
        el('span', { class: 'text-[28px] font-semibold tracking-tight', style: { color: 'var(--text-0)' } }, [String(totals.prompts)]),
        el('span', { class: 'text-[11.5px]', style: { color: 'var(--text-2)' } }, [`${totals.favorites} favorited`]),
      ]),
    ]),
    topTags.length > 0 ? el('div', { class: 'mt-3 flex flex-wrap gap-1' }, topTags.map(([tag, count]) =>
      el('span', { class: 'tag' }, [tag, el('span', { class: 'ml-1', style: { color: 'var(--text-3)' } }, [String(count)])])
    )) : null,
  ]);
}

function pinnedCard(p, ctx) {
  const running = firstRunning(p.id);
  const runningCmd = running ? p.commands?.[running.commandIndex] : null;
  return el('div', { class: 'card card-hover', style: { padding: '14px' } }, [
    el('div', { class: 'flex items-start gap-3' }, [
      logoTile(p.name, 36, p.id),
      el('div', { class: 'flex-1 min-w-0' }, [
        el('div', { class: 'flex items-center gap-1.5' }, [
          el('span', { class: 'text-[14px] font-semibold truncate-1', style: { color: 'var(--text-0)' } }, [p.name]),
          p.pinned ? el('i', { class: 'ph-fill ph-star text-[11px]', style: { color: 'var(--amber)' } }) : null,
        ]),
        el('div', { class: 'text-[11px] mono truncate-1', style: { color: 'var(--text-2)' } }, [p.path]),
      ]),
    ]),
    el('div', { class: 'mt-3 flex items-center gap-1.5 flex-wrap' },
      (p.commands || []).slice(0, 3).map((c, i) => {
        const isRun = !!running && running.commandIndex === i;
        const tint = commandPillClass(c.name);
        return el('span', { class: `pill pill-sm ${tint}` }, [
          isRun ? el('span', { class: 'dot dot-green pulse', style: { width: '5px', height: '5px' } }) : null,
          el('span', { class: 'mono' }, [c.name]),
        ]);
      })
    ),
    el('div', { class: 'mt-3 pt-3 border-t flex items-center justify-between', style: { borderColor: 'var(--line-1)' } }, [
      el('span', { class: 'text-[11px]', style: { color: 'var(--text-2)' } }, [
        running ? `Running · ${timeAgo(running.startedAt)}` : p.lastRunAt ? `Last run · ${timeAgo(p.lastRunAt)}` : 'Not run yet',
      ]),
      running
        ? el('button', { class: 'btn btn-sm btn-ghost', onclick: () => ctx.stopCommand(p.id, running.commandIndex, runningCmd?.name || '') }, [
            el('i', { class: 'ph ph-stop-circle text-[13px]', style: { color: 'var(--red)' } }),
            'Stop',
          ])
        : (p.commands || []).length > 0
          ? el('button', { class: 'btn btn-sm btn-ghost', onclick: () => ctx.runCommand(p.id, 0) }, [
              el('i', { class: 'ph ph-play text-[13px]', style: { color: 'var(--green)' } }),
              'Run',
            ])
          : null,
    ]),
  ]);
}

function activityFeedCard(ctx) {
  const items = state.activity.slice(0, 8);
  return el('div', { class: 'card', style: { padding: '16px' } }, [
    el('div', { class: 'flex items-center justify-between mb-3' }, [
      el('h3', { class: 'text-[14px] font-semibold', style: { color: 'var(--text-0)' } }, ['Recent activity']),
      el('button', { class: 'text-[11.5px]', style: { color: 'var(--text-2)', background: 'transparent', border: 0, cursor: 'pointer' }, onclick: async () => { await api.clearActivity(); ctx.refresh(); toast('Activity cleared'); } }, ['Clear']),
    ]),
    items.length === 0
      ? el('div', { class: 'text-[12px] py-4', style: { color: 'var(--text-2)' } }, ['No activity yet. Run a command or create a prompt.'])
      : el('ol', { class: 'flex flex-col gap-0', style: { margin: 0, padding: 0, listStyle: 'none' } }, items.map((item, i) => activityItem(item, i === items.length - 1))),
  ]);
}

function activityItem(item, last) {
  const icons = {
    'cmd.run': { ic: 'ph-fill ph-play', color: 'var(--cmd-run)', bg: 'var(--cmd-run-soft)' },
    'cmd.run.run': { ic: 'ph-fill ph-play', color: 'var(--cmd-run)', bg: 'var(--cmd-run-soft)' },
    'cmd.run.build': { ic: 'ph-fill ph-hammer', color: 'var(--cmd-build)', bg: 'var(--cmd-build-soft)' },
    'cmd.run.test': { ic: 'ph-fill ph-test-tube', color: 'var(--cmd-test)', bg: 'var(--cmd-test-soft)' },
    'cmd.stop': { ic: 'ph-fill ph-stop', color: 'var(--red)', bg: 'var(--red-soft)' },
    'mcp.invoke': { ic: 'ph-fill ph-wrench', color: 'var(--accent-hover)', bg: 'var(--accent-soft)' },
    'mcp.discover': { ic: 'ph-fill ph-plugs-connected', color: 'var(--green)', bg: 'var(--green-soft)' },
    'mcp.error': { ic: 'ph-fill ph-warning', color: 'var(--red)', bg: 'var(--red-soft)' },
    'mcp.added': { ic: 'ph-fill ph-plus', color: 'var(--accent-hover)', bg: 'var(--accent-soft)' },
    'prompt.created': { ic: 'ph-fill ph-chat-circle-text', color: 'var(--cyan)', bg: 'var(--cyan-soft)' },
    'md.imported': { ic: 'ph-fill ph-file-arrow-up', color: 'var(--text-1)', bg: 'var(--cmd-custom-soft)' },
    'project.created': { ic: 'ph-fill ph-plus', color: 'var(--accent-hover)', bg: 'var(--accent-soft)' },
    'project.deleted': { ic: 'ph-fill ph-trash', color: 'var(--red)', bg: 'var(--red-soft)' },
    'project.ide': { ic: 'ph-fill ph-code', color: 'var(--cyan)', bg: 'var(--cyan-soft)' },
  };
  const def = icons[item.type] || { ic: 'ph-fill ph-circle', color: 'var(--text-1)', bg: 'var(--bg-3)' };
  return el('li', { class: 'activity-item' }, [
    last ? null : el('span', { class: 'rail' }),
    el('span', { class: 'icon-dot', style: { background: def.bg } }, [el('i', { class: def.ic, style: { color: def.color } })]),
    el('div', { class: 'text-[12.5px]', style: { color: 'var(--text-0)' } }, [
      item.title,
      item.subtitle ? el('span', { class: 'ml-1', style: { color: 'var(--text-2)' } }, ['· ', item.subtitle]) : null,
    ]),
    el('div', { class: 'text-[11px]', style: { color: 'var(--text-2)' } }, [timeAgo(item.timestamp)]),
  ]);
}

function quickAction({ icon, color, bg, title, sub, keys, onClick }) {
  return el('button', { class: 'qa-tile card', style: { padding: '16px', border: '1px solid var(--line-1)', borderRadius: 'var(--r-lg)', background: 'var(--bg-1)' }, onclick: onClick }, [
    el('div', { class: 'w-8 h-8 rounded-lg flex items-center justify-center mb-3', style: { background: bg, color } }, [
      el('i', { class: `ph ${icon} text-[16px]` }),
    ]),
    el('div', { class: 'text-[13px] font-semibold', style: { color: 'var(--text-0)' } }, [title]),
    el('div', { class: 'text-[11.5px] mt-0.5', style: { color: 'var(--text-2)' } }, [sub]),
    el('div', { class: 'mt-3 flex items-center gap-1' }, keys.map(k => el('span', { class: 'kbd' }, [k]))),
  ]);
}

function todayCard() {
  const since = Date.now() - 1000 * 60 * 60 * 24;
  const todayEvents = state.activity.filter(a => new Date(a.timestamp).getTime() >= since);
  const commandRuns = todayEvents.filter(a => a.type.startsWith('cmd.run')).length;
  const toolInvokes = todayEvents.filter(a => a.type === 'mcp.invoke').length;
  const promptsCreated = todayEvents.filter(a => a.type === 'prompt.created').length;
  return el('div', { class: 'card', style: { padding: '16px' } }, [
    el('div', { class: 'flex items-center justify-between mb-2' }, [
      el('span', { class: 'label-sm' }, ['Today']),
      el('i', { class: 'ph ph-calendar-blank text-[13px]', style: { color: 'var(--text-2)' } }),
    ]),
    el('div', { class: 'grid grid-cols-3 gap-2' }, [
      todayStat(commandRuns, 'commands run'),
      todayStat(toolInvokes, 'tools invoked'),
      todayStat(promptsCreated, 'prompts created'),
    ]),
  ]);
}

function todayStat(value, label) {
  return el('div', {}, [
    el('div', { class: 'text-[18px] font-semibold', style: { color: 'var(--text-0)' } }, [String(value)]),
    el('div', { class: 'text-[10.5px]', style: { color: 'var(--text-2)' } }, [label]),
  ]);
}

function tipCard() {
  return el('div', { class: 'card', style: { padding: '16px', background: 'linear-gradient(180deg, var(--bg-1), var(--accent-softer))' } }, [
    el('div', { class: 'flex items-center gap-1.5 mb-1' }, [
      el('i', { class: 'ph-fill ph-sparkle text-[12px]', style: { color: 'var(--accent-hover)' } }),
      el('span', { class: 'label-sm', style: { color: 'var(--accent-hover)' } }, ['Tip']),
    ]),
    el('div', { class: 'text-[12.5px] leading-relaxed', style: { color: 'var(--text-1)' } }, [
      'Press ',
      el('span', { class: 'kbd' }, ['⌘']),
      ' ',
      el('span', { class: 'kbd' }, ['K']),
      ' to jump to any project, prompt, tool, or doc.',
    ]),
  ]);
}

function emptyDashboard(ctx) {
  return el('section', { class: 'hero-wash', style: { padding: '24px' } }, [
    el('div', { class: 'flex items-end justify-between mb-5' }, [
      el('div', {}, [
        el('h2', { class: 'text-[26px] font-semibold leading-tight tracking-tight', style: { color: 'var(--text-0)' } }, ['Welcome to Vibe Launcher.']),
        el('p', { class: 'text-[13.5px] mt-1', style: { color: 'var(--text-1)', maxWidth: '560px' } }, [
          "This is the command center for everything you vibe-code. Nothing here yet — let's point it at your first project.",
        ]),
      ]),
    ]),
    el('div', { class: 'grid grid-cols-4 gap-3 mb-6', style: { opacity: 0.6 } }, [
      statCard({ label: 'Projects', value: 0 }),
      statCard({ label: 'Running', value: 0 }),
      statCard({ label: 'MCP online', value: 0 }),
      statCard({ label: 'Prompts', value: 0 }),
    ]),
    el('div', { class: 'card', style: { padding: '24px' } }, [
      el('div', { class: 'flex items-start gap-5' }, [
        el('div', { class: 'w-12 h-12 rounded-xl flex items-center justify-center flex-none', style: { background: 'var(--accent-soft)' } }, [
          el('i', { class: 'ph-fill ph-rocket-launch text-[22px]', style: { color: 'var(--accent-hover)' } }),
        ]),
        el('div', { class: 'flex-1' }, [
          el('h3', { class: 'text-[16px] font-semibold', style: { color: 'var(--text-0)' } }, ['Get started in under a minute']),
          el('p', { class: 'text-[12.5px] mt-0.5', style: { color: 'var(--text-2)' } }, ['Pick one to begin — you can always add the rest later.']),
          el('div', { class: 'grid grid-cols-4 gap-3 mt-5' }, [
            onboardingTile(1, 'active', 'ph-folder-plus', 'var(--accent-hover)', 'var(--accent-soft)', 'Add a project', 'Point to a folder on your machine', () => ctx.emit('new-project')),
            onboardingTile(2, '', 'ph-plugs', 'var(--green)', 'var(--green-soft)', 'Connect MCP', 'Wire up a tool server', () => ctx.emit('new-mcp')),
            onboardingTile(3, '', 'ph-chat-circle-dots', 'var(--cyan)', 'var(--cyan-soft)', 'Save a prompt', 'Template with variables', () => ctx.emit('new-prompt')),
            onboardingTile(4, '', 'ph-file-arrow-down', 'var(--amber)', 'var(--amber-soft)', 'Drop a markdown', 'Specs, notes, cheat sheets', () => ctx.emit('import-markdown')),
          ]),
        ]),
      ]),
    ]),
  ]);
}

function onboardingTile(n, variant, icon, color, bg, title, sub, onClick) {
  return el('button', { class: 'qa-tile card', style: { padding: '16px', textAlign: 'left', position: 'relative', border: '1px solid var(--line-1)' }, onclick: onClick }, [
    el('span', { class: 'absolute top-3 right-3 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-semibold', style: { background: variant === 'active' ? 'var(--accent)' : 'var(--bg-3)', color: variant === 'active' ? 'white' : 'var(--text-1)' } }, [String(n)]),
    el('div', { class: 'w-8 h-8 rounded-lg flex items-center justify-center mb-3', style: { background: bg, color } }, [
      el('i', { class: `ph ${icon} text-[16px]` }),
    ]),
    el('div', { class: 'text-[13px] font-semibold', style: { color: 'var(--text-0)' } }, [title]),
    el('div', { class: 'text-[11.5px] mt-0.5', style: { color: 'var(--text-2)' } }, [sub]),
  ]);
}

export function commandPillClass(name) {
  const n = String(name || '').toLowerCase();
  if (/^(dev|start|serve|run)/.test(n)) return 'pill-run';
  if (/build|bundle|compile/.test(n)) return 'pill-build';
  if (/test|spec|e2e/.test(n)) return 'pill-test';
  return 'pill-custom';
}
