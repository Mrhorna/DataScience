// Browser regression checks for the habit tracker.
//
//   cd habit-tracker && python3 -m http.server 8731 &
//   npm i playwright-core && node test/regression.js
//
// Set OUT to a writable scratch directory and PW_CHROME to the Chromium binary.
const { chromium } = require('playwright-core');
const fs = require('fs');
const os = require('os');
const path = require('path');
const OUT = process.env.OUT || fs.mkdtempSync(path.join(os.tmpdir(), 'habit-test-'));
const CHROME = process.env.PW_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const BASE = process.env.BASE_URL || 'http://localhost:8731';
let failures = 0;
const check = (label, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}: ${JSON.stringify(actual)}${ok ? '' : ' expected ' + JSON.stringify(expected)}`);
};

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 900, height: 1200 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const logs = [];
  page.on('pageerror', e => logs.push(e.message));
  await page.goto(`${BASE}/index.html`);

  // --- habit strength: 30 weekdays, every 5th incomplete ---
  console.log('\n[1] Habit strength (EMA)');
  await page.evaluate(() => {
    const k = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    const addDays = (d,n) => { const r = new Date(d); r.setDate(r.getDate()+n); return r; };
    const st = JSON.parse(localStorage.getItem('habit-tracker-v1'));
    const ps = st.sections.find(s => s.id === 'perfect-start');
    st.checkins = {}; st.wakeTimes = {}; st.bedTimes = {}; st.energy = {};
    let n = 0;
    for (let i = 40; i >= 1; i--) {   // leave today empty so progress starts at 0/5
      const d = addDays(new Date(), -i);
      if (![1,2,3,4,5].includes(d.getDay())) continue;
      const ds = k(d);
      st.checkins[ds] = {};
      ps.steps.forEach(s => { st.checkins[ds][s.id] = n % 5 !== 0; });
      st.wakeTimes[ds] = '05:25';
      n++;
    }
    localStorage.setItem('habit-tracker-v1', JSON.stringify(st));
  });
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(400);
  const expectedScore = await page.evaluate(() => {
    const k = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    const addDays = (d,n) => { const r = new Date(d); r.setDate(r.getDate()+n); return r; };
    const st = JSON.parse(localStorage.getItem('habit-tracker-v1'));
    const ps = st.sections.find(s => s.id === 'perfect-start');
    const mult = Math.pow(0.5, Math.sqrt(5/7)/13);
    let score = 0;
    for (let i = 40; i >= 0; i--) {
      const d = addDays(new Date(), -i);
      if (![1,2,3,4,5].includes(d.getDay())) continue;
      const ds = k(d);
      const done = ps.steps.every(s => st.checkins[ds] && st.checkins[ds][s.id]);
      score = score * mult + (done ? 1 : 0) * (1 - mult);
    }
    return Math.round(score * 100) + '%';  });
  const shownScore = (await page.locator('.hero-tile').first().innerText()).split('\n')[1];
  check('score matches independent recomputation', shownScore, expectedScore);
  check('streak still shown as secondary',
    (await page.locator('.hero-tile').first().innerText()).includes('racha'), true);

  // --- progress indicator ---
  console.log('\n[2] Progress + row tap');
  const todayAllOff = await page.locator('#progress-row').innerText();
  check('progress starts at 0/5', todayAllOff.split('\n')[0], '0/5');
  await page.locator('.step-row').nth(0).click({ position: { x: 80, y: 25 } });
  await page.waitForTimeout(150);
  check('tapping the row body toggles it', (await page.locator('#progress-row').innerText()).split('\n')[0], '1/5');
  for (let i = 1; i < 5; i++) {
    await page.locator('.step-row').nth(i).click({ position: { x: 80, y: 25 } });
    await page.waitForTimeout(80);
  }
  check('chip reads Completo at 5/5', (await page.locator('.state-chip').innerText()), 'Completo');

  // --- energy ---
  console.log('\n[3] Energy');
  await page.getByRole('button', { name: '4', exact: true }).click();
  await page.waitForTimeout(150);
  check('energy persists', await page.evaluate(() =>
    JSON.parse(localStorage.getItem('habit-tracker-v1')).energy[new Date().toISOString().slice(0,10)]), 4);
  await page.getByRole('button', { name: '4', exact: true }).click();
  await page.waitForTimeout(150);
  check('re-click clears it', await page.evaluate(() =>
    Object.keys(JSON.parse(localStorage.getItem('habit-tracker-v1')).energy).length), 0);
  await page.getByRole('button', { name: '3', exact: true }).click();
  await page.waitForTimeout(150);

  // --- edit mode guards the destructive control ---
  console.log('\n[4] Edit mode');
  check('delete hidden by default', await page.locator('.habit-remove').first().isVisible(), false);
  await page.click('#edit-toggle');
  await page.waitForTimeout(200);
  check('delete visible in edit mode', await page.locator('.habit-remove').first().isVisible(), true);
  const rowsBefore = await page.locator('.step-item').count();
  await page.locator('.habit-remove').first().click();
  await page.waitForTimeout(150);
  check('first tap arms, deletes nothing', await page.locator('.step-item').count(), rowsBefore);
  check('button asks for confirmation', await page.locator('.habit-remove').first().innerText(), '¿Eliminar?');
  await page.locator('.habit-remove').first().click();
  await page.waitForTimeout(200);
  check('second tap deletes', await page.locator('.step-item').count(), rowsBefore - 1);
  await page.click('#edit-toggle');
  await page.waitForTimeout(150);

  // --- export / import round trip ---
  console.log('\n[5] Export / import');
  const [csvDl] = await Promise.all([page.waitForEvent('download'), page.click('#export-csv')]);
  await csvDl.saveAs(`${OUT}/reg.csv`);
  const csv = fs.readFileSync(`${OUT}/reg.csv`, 'utf8').split('\n');
  check('csv header', csv[0], 'fecha,seccion,metrica,item,valor');
  check('csv carries an energy row', csv.some(l => l.includes(',energia,')), true);
  const [jsonDl] = await Promise.all([page.waitForEvent('download'), page.click('#export-json')]);
  await jsonDl.saveAs(`${OUT}/reg.json`);
  const strengthBefore = (await page.locator('.hero-tile').first().innerText()).split('\n')[1];
  await page.evaluate(() => localStorage.removeItem('habit-tracker-v1'));
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(300);
  check('wiped state renders without error', (await page.locator('.hero-tile').first().innerText()).split('\n')[1], '0%');
  await page.setInputFiles('#import-json', `${OUT}/reg.json`);
  await page.waitForTimeout(400);
  check('import asks before replacing', await page.locator('#data-status.confirm').isVisible(), true);
  check('no native dialog used', logs.length, 0);
  await page.getByRole('button', { name: 'Reemplazar' }).click();
  await page.waitForTimeout(500);
  check('restore brings strength back', (await page.locator('.hero-tile').first().innerText()).split('\n')[1], strengthBefore);

  // --- weak link tie handling ---
  console.log('\n[6] Weakest link');
  const seedTies = (weak) => {
    const k = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    const addDays = (d,n) => { const r = new Date(d); r.setDate(r.getDate()+n); return r; };
    const st = JSON.parse(localStorage.getItem('habit-tracker-v1'));
    const ps = st.sections.find(s => s.id === 'perfect-start');
    st.checkins = {};
    let n = 0;
    for (let i = 20; i >= 0; i--) {
      const d = addDays(new Date(), -i);
      if (![1,2,3,4,5].includes(d.getDay())) continue;
      const ds = k(d);
      st.checkins[ds] = {};
      ps.steps.forEach(s => { st.checkins[ds][s.id] = (weak && s.id === 'ps-gym') ? (n % 2 === 0) : true; });
      n++;
    }
    localStorage.setItem('habit-tracker-v1', JSON.stringify(st));
  };
  await page.evaluate(seedTies, false);
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(300);
  check('no badge when all steps tie', await page.locator('.weak-badge').count(), 0);
  await page.evaluate(seedTies, true);
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(300);
  check('badge on the lagging step',
    (await page.locator('.meter-row-head').filter({ has: page.locator('.weak-badge') }).innerText()).split('\n')[0], 'Gym');

  // --- responsive layout ---
  console.log('\n[7] Layout at phone, tablet and desktop widths');
  for (const [name, w, h, chartsBeside] of [
    ['phone', 390, 844, false],
    ['tablet', 960, 1100, false],
    ['desktop', 1440, 1000, true],
  ]) {
    const p = await ctx.newPage();
    p.on('pageerror', e => logs.push(e.message));
    await p.setViewportSize({ width: w, height: h });
    await p.goto(`${BASE}/index.html`);
    await p.waitForTimeout(500);
    const m = await p.evaluate(() => {
      const box = s => { const el = document.querySelector(s); const b = el.getBoundingClientRect();
        return { x: Math.round(b.x), w: Math.round(b.width) }; };
      const focusable = [...document.querySelectorAll('button, input, select, label.file-btn')]
        .filter(el => el.offsetParent !== null && !el.disabled);
      return {
        overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        today: box('.today-card'),
        charts: box('[data-panel="heatmap"]'),
        checkIdx: focusable.findIndex(el => el.classList.contains('habit-check')),
        exportIdx: focusable.findIndex(el => el.id === 'export-csv'),
      };
    });
    check(`${name}: no horizontal scroll`, m.overflow, false);
    check(`${name}: charts beside the day`, m.charts.x > m.today.x + m.today.w - 20, chartsBeside);
    check(`${name}: day reachable before export keys`, m.checkIdx < m.exportIdx, true);
    await p.close();
  }

  console.log('\nconsole errors:', JSON.stringify(logs));
  console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
  await browser.close();
  process.exit(failures === 0 && logs.length === 0 ? 0 : 1);
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
