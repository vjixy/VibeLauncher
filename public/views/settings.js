import { el, mount, downloadBlob } from '../utils.js';
import { state, applySettingsToDocument } from '../state.js';
import { renderSidebar, renderHeader, panelBlock } from '../chrome.js';
import { api } from '../api.js';
import { toast, confirmDialog } from '../ui.js';

const SECTIONS = [
  { id: 'appearance', label: 'Appearance', icon: 'ph-paint-brush' },
  { id: 'editors', label: 'Shell & editors', icon: 'ph-terminal' },
  { id: 'storage', label: 'Storage', icon: 'ph-database' },
  { id: 'backup', label: 'Backup & restore', icon: 'ph-arrows-clockwise' },
  { id: 'about', label: 'About', icon: 'ph-info' },
];

export function renderSettings(ctx) {
  const sv = state.settings_view;

  renderSidebar({ ...ctx, contextPanel: el('div', { class: 'flex flex-col gap-4 flex-1 min-h-0' }, [
    panelBlock('Settings', null,
      SECTIONS.map(s => el('button', {
        class: `side-item ${sv.section === s.id ? 'active' : ''}`, style: { width: '100%', border: 0, textAlign: 'left' },
        onclick: () => { sv.section = s.id; renderSettings(ctx); },
      }, [el('i', { class: `ph ${s.icon} text-[14px]` }), s.label]))
    ),
  ]) });

  renderHeader({
    title: 'Settings',
    subtitle: SECTIONS.find(s => s.id === sv.section)?.label,
    onPalette: ctx.onPalette,
    onSearch: () => {},
    actions: [el('span', { class: 'pill pill-sm' }, [el('span', { class: 'dot dot-green', style: { width: '5px', height: '5px', boxShadow: 'none' } }), 'autosaved'])],
  });

  const content = document.getElementById('appContent');
  mount(content, el('section', { style: { padding: '32px', maxWidth: '960px' } }, [
    sv.section === 'appearance' ? appearanceSection(ctx) : null,
    sv.section === 'editors' ? editorsSection(ctx) : null,
    sv.section === 'storage' ? storageSection(ctx) : null,
    sv.section === 'backup' ? backupSection(ctx) : null,
    sv.section === 'about' ? aboutSection(ctx) : null,
  ]));
}

async function save(patch, ctx) {
  const next = await api.updateSettings({ ...state.settings, ...patch });
  state.settings = next;
  applySettingsToDocument();
  if (ctx) ctx.refresh();
}

function sectionHeader(icon, title, sub) {
  return el('div', { class: 'flex items-center gap-3 mb-6' }, [
    el('div', { class: 'w-10 h-10 rounded-lg flex items-center justify-center', style: { background: 'var(--accent-soft)', color: 'var(--accent-hover)' } }, [
      el('i', { class: `ph-fill ${icon} text-[20px]` }),
    ]),
    el('div', {}, [
      el('h2', { class: 'text-[20px] font-semibold tracking-tight' }, [title]),
      el('p', { class: 'text-[12.5px]', style: { color: 'var(--text-2)', margin: 0 } }, [sub]),
    ]),
  ]);
}

function appearanceSection(ctx) {
  return el('div', {}, [
    sectionHeader('ph-paint-brush', 'Appearance', 'Theme, density, typography. Changes apply instantly.'),
    setting('Theme', 'Pick a color mode. "System" follows your OS preference.',
      el('div', { class: 'grid grid-cols-3 gap-2' }, [
        themeTile('dark', 'Dark', 'linear-gradient(135deg, #16171d 0%, #111216 100%)', ctx),
        themeTile('light', 'Light', 'linear-gradient(135deg, #ffffff 0%, #f3f4f7 100%)', ctx),
        themeTile('system', 'System', 'linear-gradient(135deg, #16171d 0%, #ffffff 100%)', ctx),
      ])),
    setting('Accent color', 'Used for the logo mark, selected states, and focus rings.',
      el('div', { class: 'flex items-center gap-2 flex-wrap' }, [
        accentSwatch('indigo', '#6f70ff', ctx),
        accentSwatch('emerald', '#4ec9a0', ctx),
        accentSwatch('amber', '#d9a64a', ctx),
        accentSwatch('cyan', '#5ab7d4', ctx),
        accentSwatch('rose', '#e26a6a', ctx),
        accentSwatch('violet', '#c28bff', ctx),
      ])),
    setting('Density', 'Row height, card padding, and the nav.',
      el('div', { class: 'seg', style: { width: '100%' } }, ['compact', 'comfortable', 'spacious'].map(d =>
        el('button', { class: `flex-1 ${state.settings.density === d ? 'active' : ''}`, onclick: () => save({ density: d }, ctx) }, [d[0].toUpperCase() + d.slice(1)])
      ))),
    setting('Reduce motion', 'Disables transitions throughout the app.',
      el('div', { class: 'flex items-center justify-end' }, [
        el('button', { class: `toggle ${state.settings.reduceMotion ? 'on' : ''}`, onclick: () => save({ reduceMotion: !state.settings.reduceMotion }, ctx) }),
      ])),
    setting('Show status dots', 'Green/red dots next to MCP servers and running indicators.',
      el('div', { class: 'flex items-center justify-end' }, [
        el('button', { class: `toggle ${state.settings.showStatusDots ? 'on' : ''}`, onclick: () => save({ showStatusDots: !state.settings.showStatusDots }, ctx) }),
      ])),
  ]);
}

function themeTile(id, label, gradient, ctx) {
  const active = state.settings.theme === id;
  return el('button', { class: `theme-tile ${active ? 'active' : ''}`, onclick: () => save({ theme: id }, ctx) }, [
    el('div', { class: 'h-14 rounded-md mb-2', style: { background: gradient, border: '1px solid var(--line-1)' } }),
    el('div', { class: 'text-[11.5px] font-semibold text-center', style: { color: active ? 'var(--accent-hover)' : 'var(--text-1)' } }, [label]),
  ]);
}

function accentSwatch(id, color, ctx) {
  const active = state.settings.accent === id;
  return el('button', { class: `accent-swatch ${active ? 'active' : ''}`, style: { background: color }, title: id, onclick: () => save({ accent: id }, ctx) });
}

function editorsSection(ctx) {
  const ideSelect = document.createElement('select');
  ['code', 'cursor', 'windsurf', 'antigravity', 'subl', 'idea', 'webstorm'].forEach(v => {
    const opt = document.createElement('option'); opt.value = v; opt.textContent = v;
    if (state.settings.defaultIde === v) opt.selected = true;
    ideSelect.appendChild(opt);
  });
  ideSelect.onchange = () => save({ defaultIde: ideSelect.value }, ctx);

  const startupSelect = document.createElement('select');
  ['dashboard', 'launcher', 'mcp', 'prompts', 'markdown'].forEach(v => {
    const opt = document.createElement('option'); opt.value = v; opt.textContent = v;
    if (state.settings.startupSection === v) opt.selected = true;
    startupSelect.appendChild(opt);
  });
  startupSelect.onchange = () => save({ startupSection: startupSelect.value }, ctx);

  return el('div', {}, [
    sectionHeader('ph-terminal', 'Shell & editors', 'Defaults for opening commands and the IDE.'),
    setting('Default IDE', 'Used when a new project doesn’t specify one.',
      el('div', { class: 'field' }, [ideSelect])),
    setting('Startup section', 'Which tab Vibe Launcher opens to.',
      el('div', { class: 'field' }, [startupSelect])),
  ]);
}

function storageSection(ctx) {
  return el('div', {}, [
    sectionHeader('ph-database', 'Storage', 'Everything is stored locally — no cloud, no account.'),
    el('div', { class: 'card', style: { padding: '16px' } }, [
      el('div', { class: 'text-[13px]', style: { color: 'var(--text-1)' } }, [
        'Data lives in ', el('span', { class: 'mono' }, ['projects.json']), ' next to the launcher binary.',
      ]),
      el('div', { class: 'mt-2 text-[12px]', style: { color: 'var(--text-2)' } }, [
        `Projects: ${state.projects.length} · MCP: ${state.mcpServers.length} · Prompts: ${state.prompts.length} · Markdown: ${state.markdownFiles.length}`,
      ]),
    ]),
  ]);
}

function backupSection(ctx) {
  return el('div', {}, [
    sectionHeader('ph-arrows-clockwise', 'Backup & restore', 'Export everything as a single JSON file; re-import to restore.'),
    setting('Export backup', 'Download a snapshot of projects, MCP servers, prompts, and markdown metadata.',
      el('button', { class: 'btn btn-secondary', onclick: () => window.open('/api/backup', '_blank') }, [el('i', { class: 'ph ph-download-simple' }), 'Download backup']),
    ),
    setting('Import backup', 'Replace everything with a previous backup file.',
      el('button', { class: 'btn btn-destructive', onclick: async () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json,application/json';
        input.onchange = async () => {
          const file = input.files?.[0];
          if (!file) return;
          const text = await file.text();
          let data;
          try { data = JSON.parse(text); } catch { return toast('Invalid JSON', { type: 'error' }); }
          const ok = await confirmDialog({ title: 'Restore backup?', message: 'This will overwrite all current data.', confirmLabel: 'Restore', danger: true });
          if (!ok) return;
          await api.restoreBackup(data);
          toast('Restored — reloading', { type: 'success' });
          setTimeout(() => location.reload(), 800);
        };
        input.click();
      } }, [el('i', { class: 'ph ph-upload-simple' }), 'Restore from file']),
    ),
    setting('Clear activity log', 'Empty the recent activity feed. Projects, MCP, prompts, and markdown are not affected.',
      el('button', { class: 'btn btn-ghost', onclick: async () => { await api.clearActivity(); await ctx.refresh(); toast('Activity cleared'); } }, ['Clear activity']),
    ),
  ]);
}

function aboutSection() {
  return el('div', {}, [
    sectionHeader('ph-info', 'About', 'Local-first, offline, yours.'),
    el('div', { class: 'card', style: { padding: '20px' } }, [
      el('div', { class: 'flex items-center gap-3 mb-3' }, [
        el('div', { class: 'brand-mark', style: { width: '36px', height: '36px' } }, [el('i', { class: 'ph-fill ph-rocket-launch', style: { fontSize: '18px' } })]),
        el('div', {}, [
          el('div', { class: 'text-[15px] font-semibold' }, ['Vibe Launcher']),
          el('div', { class: 'text-[11px] mono', style: { color: 'var(--text-2)' } }, ['v1.0.2']),
        ]),
      ]),
      el('p', { class: 'text-[12.5px]', style: { color: 'var(--text-1)' } }, ['A local web dashboard for your vibe-coded projects, MCP servers, prompts, and markdown.']),
      el('div', { class: 'mt-3 text-[11.5px]', style: { color: 'var(--text-2)' } }, ['No account. No cloud. No telemetry.']),
    ]),
  ]);
}

function setting(title, desc, control) {
  return el('div', { class: 'setting' }, [
    el('div', {}, [
      el('h3', {}, [title]),
      el('p', {}, [desc]),
    ]),
    control,
  ]);
}
