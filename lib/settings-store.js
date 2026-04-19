const fs = require('fs');
const path = require('path');

const SETTINGS_FILE = path.join(__dirname, '..', 'settings.json');

const DEFAULTS = {
  theme: 'dark',
  accent: 'indigo',
  density: 'comfortable',
  reduceMotion: false,
  showStatusDots: true,
  defaultIde: 'code',
  startupSection: 'dashboard',
};

function normalize(raw = {}) {
  const out = { ...DEFAULTS };
  for (const key of Object.keys(DEFAULTS)) {
    if (raw[key] !== undefined) out[key] = raw[key];
  }
  if (!['dark', 'light', 'system'].includes(out.theme)) out.theme = 'dark';
  if (!['indigo', 'emerald', 'amber', 'cyan', 'rose', 'violet'].includes(out.accent)) out.accent = 'indigo';
  if (!['compact', 'comfortable', 'spacious'].includes(out.density)) out.density = 'comfortable';
  out.reduceMotion = Boolean(out.reduceMotion);
  out.showStatusDots = Boolean(out.showStatusDots);
  out.defaultIde = String(out.defaultIde || 'code').trim() || 'code';
  if (!['dashboard', 'launcher', 'mcp', 'prompts', 'markdown'].includes(out.startupSection)) out.startupSection = 'dashboard';
  return out;
}

function read() {
  if (!fs.existsSync(SETTINGS_FILE)) return normalize({});
  try {
    return normalize(JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')));
  } catch {
    return normalize({});
  }
}

function write(settings) {
  const next = normalize({ ...read(), ...settings });
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(next, null, 2));
  return next;
}

module.exports = { read, write, DEFAULTS };
