import { el, mount, timeAgo, weekday, shortDate, shortTime, initials, tilePalette } from './utils.js';
import { state, anyRunning } from './state.js';

const SECTIONS = [
  { id: 'dashboard', label: 'Dashboard', icon: 'ph-squares-four', activeIcon: 'ph-fill ph-squares-four' },
  { id: 'launcher',  label: 'Launcher',  icon: 'ph-rocket',        activeIcon: 'ph-fill ph-rocket' },
  { id: 'mcp',       label: 'MCP Servers', icon: 'ph-plugs',       activeIcon: 'ph-fill ph-plugs' },
  { id: 'prompts',   label: 'Prompts',   icon: 'ph-chat-circle-text', activeIcon: 'ph-fill ph-chat-circle-text' },
  { id: 'markdown',  label: 'Markdown',  icon: 'ph-file-text',     activeIcon: 'ph-fill ph-file-text' },
];

const COLORS = ['var(--accent)', 'var(--green)', 'var(--amber)', 'var(--cyan)', '#c28bff', '#e7a2bc', 'var(--text-2)'];
function colorForIndex(i) { return COLORS[i % COLORS.length]; }

export function renderSidebar({ navigate, onPalette, toggleTheme, contextPanel }) {
  const onNavigate = navigate;
  const onTheme = toggleTheme;
  const onSettings = () => navigate('settings');
  const sidebar = document.getElementById('sidebar');
  mount(sidebar,
    el('div', { class: 'sidebar-brand' }, [
      el('div', { class: 'brand-mark' }, [el('i', { class: 'ph-fill ph-rocket-launch' })]),
      el('div', { class: 'flex flex-col leading-tight flex-1 min-w-0' }, [
        el('div', { class: 'brand-name' }, ['Vibe Launcher']),
        el('div', { class: 'brand-sub' }, ['localhost:3000']),
      ]),
      el('button', { class: 'btn btn-ghost btn-icon', title: 'Command palette · ⌘K', onclick: onPalette }, [
        el('i', { class: 'ph ph-command text-[14px]' }),
      ]),
    ]),
    el('div', { class: 'sidebar-nav' }, [
      el('div', { class: 'sidebar-block' }, [
        el('div', { class: 'label-sm', style: { padding: '0 8px 8px' } }, ['Navigate']),
        el('div', { class: 'flex flex-col gap-0.5' }, SECTIONS.map(s => {
          const active = state.section === s.id;
          const count = s.id === 'launcher' ? state.projects.length
            : s.id === 'mcp' ? state.mcpServers.length
            : s.id === 'prompts' ? state.prompts.length
            : s.id === 'markdown' ? state.markdownFiles.length
            : null;
          return el('button', {
            class: `nav-item ${active ? 'active' : ''}`,
            style: { width: '100%', border: 0, textAlign: 'left' },
            onclick: () => onNavigate(s.id),
          }, [
            el('i', { class: `ph ${active ? s.activeIcon : s.icon} text-[15px]` }),
            el('span', {}, [s.label]),
            count !== null ? el('span', { class: 'ml-auto text-[11px]', style: { color: active ? 'var(--accent-hover)' : 'var(--text-2)' } }, [String(count)]) : null,
          ]);
        })),
      ]),
      contextPanel || null,
    ]),
    el('div', { class: 'sidebar-footer' }, [
      el('button', { class: 'btn btn-ghost btn-icon', title: 'Theme', onclick: onTheme }, [el('i', { class: 'ph ph-moon text-[14px]' })]),
      el('button', { class: 'btn btn-ghost btn-icon', title: 'Settings · ⌘,', onclick: onSettings }, [el('i', { class: 'ph ph-gear-six text-[14px]' })]),
      el('div', { class: 'version' }, [
        el('span', { class: 'dot dot-green', style: { width: '6px', height: '6px', boxShadow: 'none' } }),
        el('span', {}, ['v1.0.2']),
      ]),
    ]),
  );
}

export function renderHeader({ title, subtitle, searchPlaceholder = 'Search projects, prompts, tools, or markdown…', onSearch, actions, onPalette, searchValue }) {
  const header = document.getElementById('appHeader');
  const searchInput = el('input', { placeholder: searchPlaceholder, value: searchValue || '', oninput: (e) => onSearch && onSearch(e.target.value) });
  mount(header,
    el('div', { class: 'header-title' }, [
      el('h1', {}, [title || '']),
      subtitle ? el('p', {}, Array.isArray(subtitle) ? subtitle : [subtitle]) : null,
    ]),
    el('div', { class: 'header-search' }, [
      el('div', { class: 'field', style: { height: '36px' }, onclick: (e) => { if (e.target === e.currentTarget) searchInput.focus(); } }, [
        el('i', { class: 'ph ph-magnifying-glass text-[14px]', style: { color: 'var(--text-2)' } }),
        searchInput,
        el('span', { class: 'kbd', style: { cursor: 'pointer' }, onclick: onPalette }, ['⌘']),
        el('span', { class: 'kbd', style: { cursor: 'pointer' }, onclick: onPalette }, ['K']),
      ]),
    ]),
    el('div', { class: 'header-actions' }, actions || []),
  );
}

/* Helpers for building sidebar context panels used by views */
export function panelBlock(labelText, rightAction, children) {
  return el('div', { class: 'sidebar-block' }, [
    el('div', { class: 'sidebar-block-header' }, [
      el('div', { class: 'label-sm' }, [labelText]),
      rightAction || null,
    ]),
    el('div', { class: 'flex flex-col gap-0.5' }, children || []),
  ]);
}

export function tagRow({ color, label, count, active, onclick }) {
  return el('button', { class: `ws-row ${active ? 'active' : ''}`, style: { width: '100%', border: 0, textAlign: 'left' }, onclick }, [
    color ? el('span', { class: 'ws-bar', style: { background: color } }) : null,
    el('span', { class: 'truncate-1' }, [label]),
    count !== null && count !== undefined ? el('span', { class: 'count' }, [String(count)]) : null,
  ]);
}

export function iconRow({ icon, iconColor, label, count, active, onclick }) {
  return el('button', { class: `ws-row ${active ? 'active' : ''}`, style: { width: '100%', border: 0, textAlign: 'left' }, onclick }, [
    icon ? el('i', { class: `ph ${icon} text-[13px]`, style: iconColor ? { color: iconColor } : {} }) : null,
    el('span', { class: 'truncate-1' }, [label]),
    count !== null && count !== undefined ? el('span', { class: 'count' }, [String(count)]) : null,
  ]);
}

export function logoTile(label, size = 40, source = null) {
  const p = tilePalette(source || label);
  return el('div', { class: 'logo-tile', style: { width: `${size}px`, height: `${size}px`, background: p.bg, color: p.fg, fontSize: `${Math.max(10, size * 0.38)}px` } }, [initials(label)]);
}

export { colorForIndex, SECTIONS };

export function formatHeaderTime() {
  const now = new Date();
  return `${weekday(now)} · ${shortDate(now)} · ${shortTime(now)}`;
}

export { timeAgo };
