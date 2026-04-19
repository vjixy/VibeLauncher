export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'style' && typeof value === 'object') Object.assign(node.style, value);
    else if (key === 'dataset' && typeof value === 'object') Object.entries(value).forEach(([k, v]) => { node.dataset[k] = v; });
    else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key === 'html') node.innerHTML = value;
    else if (value === true) node.setAttribute(key, '');
    else node.setAttribute(key, value);
  }
  const append = (c) => {
    if (c === null || c === undefined || c === false) return;
    if (Array.isArray(c)) c.forEach(append);
    else if (c instanceof Node) node.appendChild(c);
    else node.appendChild(document.createTextNode(String(c)));
  };
  append(children);
  return node;
}

export function clear(node) {
  if (!node) return;
  while (node.firstChild) node.removeChild(node.firstChild);
}

export function mount(node, ...children) {
  clear(node);
  children.flat().forEach(child => {
    if (child instanceof Node) node.appendChild(child);
    else if (child !== null && child !== undefined && child !== false) {
      node.appendChild(document.createTextNode(String(child)));
    }
  });
  return node;
}

export function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

const RELATIVE = [
  [60, 'second'],
  [60 * 60, 'minute'],
  [60 * 60 * 24, 'hour'],
  [60 * 60 * 24 * 7, 'day'],
  [60 * 60 * 24 * 30, 'week'],
  [60 * 60 * 24 * 365, 'month'],
  [Infinity, 'year'],
];

export function timeAgo(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const diff = Math.max(0, (Date.now() - d.getTime()) / 1000);
  if (diff < 15) return 'just now';
  for (let i = 0; i < RELATIVE.length; i++) {
    const [cut, unit] = RELATIVE[i];
    const prev = i === 0 ? 1 : RELATIVE[i - 1][0];
    if (diff < cut) {
      const n = Math.floor(diff / prev);
      const suffix = unit === 'second' ? 's' : unit === 'minute' ? 'm' : unit === 'hour' ? 'h' : unit === 'day' ? 'd' : unit === 'week' ? 'w' : unit === 'month' ? 'mo' : 'y';
      return `${n}${suffix} ago`;
    }
  }
  return d.toLocaleDateString();
}

export function formatDuration(ms) {
  if (!ms || ms < 0) return '';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

export function formatBytes(n) {
  if (!Number.isFinite(n)) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function initials(str) {
  if (!str) return '??';
  const words = String(str).trim().split(/[\s\-_/\\]+/).filter(Boolean);
  if (words.length === 0) return '??';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

const TILE_PALETTES = [
  { bg: 'linear-gradient(135deg, #2d1f4f, #1a1030)', fg: '#b8a6ff' },
  { bg: 'linear-gradient(135deg, #183a32, #0e201b)', fg: '#7fd4b5' },
  { bg: 'linear-gradient(135deg, #3a2318, #1f130b)', fg: '#e7a27f' },
  { bg: 'linear-gradient(135deg, #1e2d4f, #0e1630)', fg: '#a6baff' },
  { bg: 'linear-gradient(135deg, #3a2244, #1c1022)', fg: '#d4a2e7' },
  { bg: 'linear-gradient(135deg, #1e3a1e, #0e200e)', fg: '#aad89f' },
  { bg: 'linear-gradient(135deg, #4a2323, #250f0f)', fg: '#e7a2a2' },
  { bg: 'linear-gradient(135deg, #2a3545, #141a24)', fg: '#a8bfd4' },
];

export function tilePalette(str) {
  const s = String(str || '');
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return TILE_PALETTES[h % TILE_PALETTES.length];
}

export function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

export function uniq(arr) {
  return [...new Set(arr)];
}

export function extractTemplateVars(template) {
  if (typeof template !== 'string') return [];
  const matches = template.matchAll(/\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g);
  return uniq([...matches].map(m => m[1]));
}

export function renderTemplate(template, vars = {}) {
  if (typeof template !== 'string') return '';
  return template.replace(/\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g, (_, name) => {
    return vars[name] !== undefined ? String(vars[name]) : `{{${name}}}`;
  });
}

export function copyToClipboard(text) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy'); } catch {}
  document.body.removeChild(ta);
  return Promise.resolve();
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function renderMarkdownToHtml(md) {
  if (!md) return '';
  const lines = md.split('\n');
  let html = '';
  let inCode = false;
  let codeLang = '';
  let inList = null;
  const flushList = () => { if (inList) { html += `</${inList}>`; inList = null; } };
  for (const raw of lines) {
    if (raw.startsWith('```')) {
      if (inCode) { html += '</code></pre>'; inCode = false; codeLang = ''; }
      else { flushList(); codeLang = raw.slice(3).trim(); html += `<pre><code${codeLang ? ` class="lang-${escapeHtml(codeLang)}"` : ''}>`; inCode = true; }
      continue;
    }
    if (inCode) { html += escapeHtml(raw) + '\n'; continue; }
    const line = raw;
    if (/^\s*$/.test(line)) { flushList(); continue; }
    const h = line.match(/^(#{1,6})\s+(.+)$/);
    if (h) { flushList(); html += `<h${h[1].length}>${inlineMd(h[2])}</h${h[1].length}>`; continue; }
    if (/^\s*[-*+]\s+/.test(line)) {
      if (inList !== 'ul') { flushList(); html += '<ul>'; inList = 'ul'; }
      html += `<li>${inlineMd(line.replace(/^\s*[-*+]\s+/, ''))}</li>`;
      continue;
    }
    if (/^\s*\d+\.\s+/.test(line)) {
      if (inList !== 'ol') { flushList(); html += '<ol>'; inList = 'ol'; }
      html += `<li>${inlineMd(line.replace(/^\s*\d+\.\s+/, ''))}</li>`;
      continue;
    }
    if (/^\s*>\s+/.test(line)) { flushList(); html += `<blockquote>${inlineMd(line.replace(/^\s*>\s+/, ''))}</blockquote>`; continue; }
    if (/^---+$/.test(line.trim())) { flushList(); html += '<hr>'; continue; }
    flushList();
    html += `<p>${inlineMd(line)}</p>`;
  }
  flushList();
  if (inCode) html += '</code></pre>';
  return html;
}

function inlineMd(s) {
  let out = escapeHtml(s);
  out = out.replace(/`([^`]+)`/g, '<code>$1</code>');
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  return out;
}

export function highlightJson(value) {
  if (value === undefined) return '';
  const json = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  const escaped = escapeHtml(json);
  return escaped
    .replace(/(&quot;(?:\\.|[^&])*?&quot;)(\s*:)?/g, (match, str, colon) => {
      if (colon) return `<span class="j-key">${str}</span>${colon}`;
      return `<span class="j-str">${str}</span>`;
    })
    .replace(/\b(true|false)\b/g, '<span class="j-bool">$1</span>')
    .replace(/\b(null)\b/g, '<span class="j-null">$1</span>')
    .replace(/(^|[\s,\[])(-?\d+(?:\.\d+)?)/g, '$1<span class="j-num">$2</span>');
}

export function weekday(date = new Date()) {
  return date.toLocaleDateString(undefined, { weekday: 'long' });
}

export function shortDate(date = new Date()) {
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function shortTime(date = new Date()) {
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export function timeOfDayGreeting(date = new Date()) {
  const h = date.getHours();
  if (h < 5) return 'Good night';
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

export function isoNow() {
  return new Date().toISOString();
}
