const { exec } = require('child_process');

// Map<uid, { projectId, commandIndex, commandName, startedAt }>
const runningByUid = new Map();

function uidFor(projectId, commandIndex) {
  return `VibeID:${projectId}-${commandIndex}`;
}

function start(projectId, commandIndex, commandName = '') {
  const uid = uidFor(projectId, commandIndex);
  runningByUid.set(uid, {
    uid,
    projectId,
    commandIndex,
    commandName,
    startedAt: new Date().toISOString(),
  });
  return uid;
}

function markStopped(uid) {
  runningByUid.delete(uid);
}

function list() {
  return [...runningByUid.values()];
}

function isRunning(projectId, commandIndex) {
  return runningByUid.has(uidFor(projectId, commandIndex));
}

function refreshFromSystem() {
  return new Promise((resolve) => {
    if (runningByUid.size === 0) return resolve([]);
    const uids = [...runningByUid.keys()];
    // Query all cmd.exe processes once, then match
    exec(
      `powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"Name='cmd.exe'\\" | ForEach-Object { $_.CommandLine }"`,
      { maxBuffer: 2 * 1024 * 1024 },
      (error, stdout) => {
        if (error) return resolve([...runningByUid.values()]);
        const lines = String(stdout || '').split(/\r?\n/);
        for (const uid of uids) {
          const present = lines.some(line => line && line.includes(uid));
          if (!present) runningByUid.delete(uid);
        }
        resolve([...runningByUid.values()]);
      }
    );
  });
}

// Periodic refresh (every 6s)
setInterval(() => { refreshFromSystem().catch(() => {}); }, 6000).unref?.();

module.exports = { uidFor, start, markStopped, list, isRunning, refreshFromSystem };
