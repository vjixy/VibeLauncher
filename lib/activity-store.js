const fs = require('fs');
const path = require('path');

const ACTIVITY_FILE = path.join(__dirname, '..', 'activity.json');
const MAX_EVENTS = 200;

function readAll() {
  if (!fs.existsSync(ACTIVITY_FILE)) return [];
  try {
    const raw = JSON.parse(fs.readFileSync(ACTIVITY_FILE, 'utf8'));
    return Array.isArray(raw) ? raw : [];
  } catch { return []; }
}

function writeAll(events) {
  fs.writeFileSync(ACTIVITY_FILE, JSON.stringify(events.slice(0, MAX_EVENTS), null, 2));
}

function record(event = {}) {
  const now = new Date().toISOString();
  const entry = {
    id: `act_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    type: String(event.type || 'info'),
    title: String(event.title || ''),
    subtitle: String(event.subtitle || ''),
    projectId: event.projectId || null,
    refId: event.refId || null,
    meta: event.meta && typeof event.meta === 'object' ? event.meta : {},
    timestamp: now,
  };
  const events = [entry, ...readAll()].slice(0, MAX_EVENTS);
  writeAll(events);
  return entry;
}

function list(limit = 30) {
  return readAll().slice(0, Math.max(1, Math.min(MAX_EVENTS, Number(limit) || 30)));
}

function clear() {
  writeAll([]);
}

module.exports = { record, list, clear };
