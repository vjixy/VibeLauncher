// One-off screenshot driver. Not shipped with the product; kept under scripts/ so
// it can be re-run later with `node scripts/screenshot.js`.
const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const EXECUTABLE = fs.existsSync(CHROME) ? CHROME : EDGE;

const OUT_DIR = path.join(__dirname, '..', 'images');
fs.mkdirSync(OUT_DIR, { recursive: true });

const BASE = 'http://localhost:3000';

async function waitReady(page) {
  await page.waitForFunction(() => !document.querySelector('#appContent .loading-state'), { timeout: 10000 });
  await new Promise(r => setTimeout(r, 350));
}

async function shot(page, name) {
  const file = path.join(OUT_DIR, name);
  await page.screenshot({ path: file, type: 'png', captureBeyondViewport: false });
  console.log('✓', name);
}

(async () => {
  const browser = await puppeteer.launch({
    executablePath: EXECUTABLE,
    headless: 'new',
    args: ['--no-sandbox', '--disable-gpu', '--hide-scrollbars'],
    defaultViewport: { width: 1440, height: 900, deviceScaleFactor: 2 },
  });
  const page = await browser.newPage();

  async function go(hash) {
    await page.goto(`${BASE}/?t=${Date.now()}#${hash}`, { waitUntil: 'networkidle0' });
    await waitReady(page);
  }

  async function waitFor(selector, timeout = 5000) {
    await page.waitForSelector(selector, { timeout });
  }

  // 1. Dashboard
  await go('dashboard');
  await shot(page, '01-dashboard.png');

  // 2. Launcher grid
  await go('launcher');
  await shot(page, '02-launcher-grid.png');

  // 3. Launcher list
  await page.evaluate(() => { window.location.hash = 'launcher'; });
  await page.evaluate(() => {
    // toggle to list view via sidebar seg button
    const btns = [...document.querySelectorAll('.seg button')];
    const list = btns.find(b => /list/i.test(b.textContent));
    if (list) list.click();
  });
  await new Promise(r => setTimeout(r, 350));
  await shot(page, '03-launcher-list.png');

  // 4. Project detail drawer
  await go('launcher');
  await waitFor('.proj-card');
  await page.click('.proj-card');
  await waitFor('.drawer');
  await new Promise(r => setTimeout(r, 500));
  await shot(page, '04-project-drawer.png');

  // 5. Project modal
  await go('launcher');
  await waitFor('.header-actions .btn-primary');
  await page.click('.header-actions .btn-primary');
  await waitFor('.modal');
  await new Promise(r => setTimeout(r, 400));
  await shot(page, '05-project-modal.png');

  // 6. MCP split view
  await go('mcp');
  // click an online server (Web Search Exa)
  await page.evaluate(() => {
    const rows = [...document.querySelectorAll('.srv-row')];
    const online = rows.find(r => r.querySelector('.dot-green'));
    if (online) online.click();
  });
  await new Promise(r => setTimeout(r, 500));
  // click first tool so the right panel is populated
  await page.evaluate(() => {
    const t = document.querySelector('.tool-card');
    if (t) t.click();
  });
  await new Promise(r => setTimeout(r, 500));
  await shot(page, '06-mcp.png');

  // 7. Prompts grid
  await go('prompts');
  await shot(page, '07-prompts.png');

  // 8. Markdown
  await go('markdown');
  await shot(page, '08-markdown.png');

  // 9. Settings
  await go('settings');
  await shot(page, '09-settings.png');

  // 10. Command palette
  await go('dashboard');
  await page.evaluate(() => {
    const ev = new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, metaKey: true, bubbles: true });
    document.dispatchEvent(ev);
  });
  await new Promise(r => setTimeout(r, 400));
  await page.evaluate(() => { const i = document.querySelector('.palette input'); if (i) { i.value = 'run'; i.dispatchEvent(new Event('input', { bubbles: true })); } });
  await new Promise(r => setTimeout(r, 400));
  await shot(page, '10-palette.png');

  // 11. Light mode hero
  await go('settings');
  await page.evaluate(() => {
    const tiles = [...document.querySelectorAll('.theme-tile')];
    const light = tiles.find(t => /light/i.test(t.textContent));
    if (light) light.click();
  });
  await new Promise(r => setTimeout(r, 400));
  await go('dashboard');
  await shot(page, '11-dashboard-light.png');
  // restore dark
  await go('settings');
  await page.evaluate(() => {
    const tiles = [...document.querySelectorAll('.theme-tile')];
    const dark = tiles.find(t => /dark/i.test(t.textContent));
    if (dark) dark.click();
  });

  await browser.close();
  console.log('\nAll screenshots saved to', OUT_DIR);
})().catch(err => { console.error(err); process.exit(1); });
