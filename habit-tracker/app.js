(function () {
  'use strict';

  const STORAGE_KEY = 'habit-tracker-v1';
  const THEME_KEY = 'habit-tracker-theme';
  const SERIES_VARS = ['--series-1', '--series-2', '--series-3', '--series-4', '--series-5', '--series-6', '--series-7', '--series-8'];
  const HEATMAP_WEEKS = 18;
  const TREND_WEEKS = 12;
  const WEEKDAYS = [1, 2, 3, 4, 5];
  const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
  const DOW_LABELS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
  const AGGREGATE_ID = '__complete__';

  function defaultSections() {
    return [
      {
        id: 'perfect-start',
        name: 'Perfect Start',
        tagline: 'Win the morning, win the day',
        type: 'routine',
        activeDays: WEEKDAYS.slice(),
        steps: [
          { id: 'ps-despertar', name: 'Despertar', detail: 'Meta 5:20 - 5:30', colorIdx: 0, wakeWindow: { from: '05:20', to: '05:30' } },
          { id: 'ps-rucking', name: 'Caminar 30 min', detail: 'Rucking — caminata con peso', colorIdx: 1 },
          { id: 'ps-gym', name: 'Gym', detail: 'Fuerza + cardio', colorIdx: 2 },
          { id: 'ps-ducha', name: 'Ducha', colorIdx: 3 },
          { id: 'ps-trabajo', name: 'Trabajo', colorIdx: 4 },
        ],
      },
      {
        id: 'habitos',
        name: 'Hábitos',
        tagline: 'Constancia diaria, sin horario fijo',
        type: 'habits',
        activeDays: ALL_DAYS.slice(),
        steps: [],
      },
    ];
  }

  function migrate(raw) {
    if (raw && raw.version === 2) return raw;
    const sections = defaultSections();
    if (raw && Array.isArray(raw.habits)) {
      const habitos = sections.find(s => s.id === 'habitos');
      habitos.steps = raw.habits.map((h, i) => ({
        id: h.id,
        name: h.name,
        colorIdx: typeof h.colorIdx === 'number' ? h.colorIdx : i,
      }));
    }
    return {
      version: 2,
      sections,
      checkins: (raw && raw.checkins) || {},
      wakeTimes: {},
    };
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return migrate(JSON.parse(raw));
    } catch (e) { /* corrupted or unavailable storage: fall back to defaults */ }
    return migrate(null);
  }

  let state = loadState();
  let activeSectionId = state.sections[0].id;
  let viewDate = new Date();
  const uiBySection = {};

  function saveState() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
    catch (e) { /* storage full or unavailable: state stays in memory only */ }
  }

  saveState();

  function currentSection() {
    return state.sections.find(s => s.id === activeSectionId) || state.sections[0];
  }

  function ui(section) {
    if (!uiBySection[section.id]) {
      uiBySection[section.id] = {
        range: 7,
        heatmapFilter: 'all',
        // A routine's headline is the whole chain, so individual steps start folded away.
        hidden: new Set(section.type === 'routine' ? section.steps.map(s => s.id) : []),
      };
    }
    return uiBySection[section.id];
  }

  // ---------- date helpers ----------
  function dateKey(d) {
    const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  function addDays(d, n) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
  function startOfWeek(d) {
    const r = new Date(d);
    r.setDate(r.getDate() - ((r.getDay() + 6) % 7));
    r.setHours(0, 0, 0, 0);
    return r;
  }
  function isFuture(d) {
    const today = new Date(); today.setHours(23, 59, 59, 999);
    return d > today;
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function colorVar(idx) { return `var(${SERIES_VARS[idx % SERIES_VARS.length]})`; }
  function minutesOf(hhmm) {
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + m;
  }
  function formatMinutes(total) {
    const h = Math.floor(total / 60), m = Math.round(total % 60);
    return `${h}:${String(m).padStart(2, '0')}`;
  }
  function shortDate(d) { return d.toLocaleDateString('es', { day: 'numeric', month: 'short' }); }

  // ---------- section helpers ----------
  function isActiveDay(section, d) { return section.activeDays.includes(d.getDay()); }
  function prevActiveDay(section, d) {
    let r = addDays(d, -1);
    for (let i = 0; i < 14 && !isActiveDay(section, r); i++) r = addDays(r, -1);
    return r;
  }
  function lastActiveDays(section, n) {
    const out = [];
    let d = new Date();
    for (let guard = 0; out.length < n && guard < n * 8 + 40; guard++) {
      if (isActiveDay(section, d)) out.push(new Date(d));
      d = addDays(d, -1);
    }
    return out;
  }
  function activeDaysLabel(section) {
    if (section.activeDays.length === 7) return '';
    if (section.activeDays.join() === WEEKDAYS.join()) return ' L-V';
    return ' días activos';
  }

  // ---------- metrics ----------
  function isChecked(dateStr, stepId) {
    return !!(state.checkins[dateStr] && state.checkins[dateStr][stepId]);
  }
  function isComplete(section, dateStr) {
    return section.steps.length > 0 && section.steps.every(s => isChecked(dateStr, s.id));
  }
  function stepRate(section, stepId, days) {
    const list = lastActiveDays(section, days);
    if (!list.length) return 0;
    const done = list.filter(d => isChecked(dateKey(d), stepId)).length;
    return done / list.length;
  }
  function completeRate(section, days) {
    const list = lastActiveDays(section, days);
    if (!list.length) return 0;
    return list.filter(d => isComplete(section, dateKey(d))).length / list.length;
  }
  function streak(section, matcher) {
    if (!section.activeDays.length || !section.steps.length) return 0;
    let d = new Date();
    for (let i = 0; i < 14 && !isActiveDay(section, d); i++) d = addDays(d, -1);
    // A day still in progress shouldn't read as a broken streak.
    if (!matcher(dateKey(d))) d = prevActiveDay(section, d);
    let count = 0;
    while (matcher(dateKey(d)) && count < 3650) {
      count++;
      d = prevActiveDay(section, d);
    }
    return count;
  }
  function dayFraction(section, dateStr) {
    if (!section.steps.length) return 0;
    const done = section.steps.filter(s => isChecked(dateStr, s.id)).length;
    return done / section.steps.length;
  }
  function wakeStats(section, days) {
    const step = section.steps.find(s => s.wakeWindow);
    if (!step) return null;
    const list = lastActiveDays(section, days);
    const recorded = [];
    let inWindow = 0;
    list.forEach(d => {
      const t = state.wakeTimes[dateKey(d)];
      if (!t) return;
      recorded.push(minutesOf(t));
      if (minutesOf(t) <= minutesOf(step.wakeWindow.to)) inWindow++;
    });
    const avg = recorded.length ? recorded.reduce((a, b) => a + b, 0) / recorded.length : null;
    return { step, avg, inWindow, recorded: recorded.length, target: minutesOf(step.wakeWindow.to) };
  }
  function weeklyRate(section, matcher, weeksBack) {
    const thisWeekStart = startOfWeek(new Date());
    const out = [];
    for (let w = weeksBack - 1; w >= 0; w--) {
      const start = addDays(thisWeekStart, -7 * w);
      let done = 0, total = 0;
      for (let i = 0; i < 7; i++) {
        const d = addDays(start, i);
        if (isFuture(d)) break;
        if (!isActiveDay(section, d)) continue;
        total++;
        if (matcher(dateKey(d))) done++;
      }
      out.push({ weekStart: start, rate: total ? done / total : 0 });
    }
    return out;
  }

  // ---------- mutations ----------
  function setCheckin(dateStr, stepId, value) {
    if (!state.checkins[dateStr]) state.checkins[dateStr] = {};
    state.checkins[dateStr][stepId] = value;
    saveState();
  }
  function addStep(section, name) {
    section.steps.push({
      id: 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      name,
      colorIdx: section.steps.length % SERIES_VARS.length,
    });
    saveState();
  }
  function removeStep(section, id) {
    section.steps = section.steps.filter(s => s.id !== id);
    saveState();
  }
  function moveStep(section, index, delta) {
    const target = index + delta;
    if (target < 0 || target >= section.steps.length) return;
    const [step] = section.steps.splice(index, 1);
    section.steps.splice(target, 0, step);
    saveState();
  }

  // ---------- tabs ----------
  function renderTabs() {
    const nav = document.getElementById('section-tabs');
    nav.innerHTML = '';
    state.sections.forEach(s => {
      const btn = document.createElement('button');
      btn.className = 'tab' + (s.id === activeSectionId ? ' active' : '');
      btn.type = 'button';
      btn.textContent = s.name;
      btn.setAttribute('aria-current', s.id === activeSectionId ? 'page' : 'false');
      btn.addEventListener('click', () => {
        activeSectionId = s.id;
        renderAll();
      });
      nav.appendChild(btn);
    });
  }

  // ---------- daily check-in ----------
  function renderDatePicker() {
    const picker = document.getElementById('date-picker');
    picker.value = dateKey(viewDate);
    picker.max = dateKey(new Date());
    document.getElementById('next-day').disabled = dateKey(viewDate) === dateKey(new Date());
  }

  function renderCheckin() {
    const section = currentSection();
    const body = document.getElementById('checkin-body');
    const dateStr = dateKey(viewDate);
    body.innerHTML = '';

    document.getElementById('section-tagline').textContent = section.tagline || '';
    document.getElementById('new-item-name').placeholder =
      section.type === 'routine' ? 'Nuevo paso (ej. Meditar 10 min)' : 'Nuevo hábito (ej. Leer 20 páginas)';

    if (!isActiveDay(section, viewDate)) {
      const note = document.createElement('p');
      note.className = 'inactive-note';
      const dayName = viewDate.toLocaleDateString('es', { weekday: 'long' });
      note.textContent = `${dayName.charAt(0).toUpperCase() + dayName.slice(1)}: fuera de los días de esta sección. Puedes marcarlo igual, pero no cuenta para la racha ni el porcentaje.`;
      body.appendChild(note);
    }

    if (!section.steps.length) {
      const empty = document.createElement('p');
      empty.className = 'empty-state';
      empty.textContent = section.type === 'routine'
        ? 'Esta rutina no tiene pasos. Agrega el primero abajo.'
        : 'Aún no tienes hábitos aquí. Agrega el primero abajo.';
      body.appendChild(empty);
      return;
    }

    const list = document.createElement('ul');
    list.className = section.type === 'routine' ? 'routine-list' : 'habit-list';

    section.steps.forEach((step, index) => {
      const li = document.createElement('li');
      li.className = section.type === 'routine' ? 'step-row' : 'habit-row';

      const dot = document.createElement('span');
      dot.className = 'habit-dot';
      dot.style.background = colorVar(step.colorIdx);

      const main = document.createElement('div');
      main.className = 'step-main';
      const nameEl = document.createElement('div');
      nameEl.className = 'step-name';
      nameEl.textContent = step.name;
      main.appendChild(nameEl);
      if (step.detail) {
        const detail = document.createElement('div');
        detail.className = 'step-detail';
        detail.textContent = step.detail;
        main.appendChild(detail);
      }

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'habit-check';
      checkbox.checked = isChecked(dateStr, step.id);
      checkbox.setAttribute('aria-label', `${step.name} - ${dateStr}`);
      checkbox.addEventListener('change', () => {
        setCheckin(dateStr, step.id, checkbox.checked);
        renderStats();
        renderHeatmap();
        renderTrend();
      });

      li.append(dot, main);

      if (section.type === 'routine') {
        const order = document.createElement('div');
        order.className = 'step-order';
        const up = document.createElement('button');
        up.type = 'button';
        up.textContent = '▲';
        up.disabled = index === 0;
        up.setAttribute('aria-label', `Subir ${step.name}`);
        up.addEventListener('click', () => { moveStep(section, index, -1); renderAll(); });
        const down = document.createElement('button');
        down.type = 'button';
        down.textContent = '▼';
        down.disabled = index === section.steps.length - 1;
        down.setAttribute('aria-label', `Bajar ${step.name}`);
        down.addEventListener('click', () => { moveStep(section, index, 1); renderAll(); });
        order.append(up, down);
        li.appendChild(order);
      }

      const removeBtn = document.createElement('button');
      removeBtn.className = 'habit-remove';
      removeBtn.type = 'button';
      removeBtn.textContent = '✕';
      removeBtn.setAttribute('aria-label', `Eliminar ${step.name}`);
      removeBtn.addEventListener('click', () => {
        if (confirm(`¿Eliminar "${step.name}"? Se perderá su historial.`)) {
          removeStep(section, step.id);
          renderAll();
        }
      });

      li.append(checkbox, removeBtn);
      list.appendChild(li);

      if (step.wakeWindow) {
        list.appendChild(buildWakeRow(step, dateStr));
      }
    });

    body.appendChild(list);
  }

  function buildWakeRow(step, dateStr) {
    const row = document.createElement('li');
    row.className = 'wake-row';

    const label = document.createElement('label');
    label.textContent = 'Hora real:';
    label.setAttribute('for', 'wake-input');

    const input = document.createElement('input');
    input.type = 'time';
    input.id = 'wake-input';
    input.value = state.wakeTimes[dateStr] || '';

    const target = document.createElement('span');
    target.textContent = `meta ${step.wakeWindow.from}-${step.wakeWindow.to}`;

    const status = document.createElement('span');
    status.className = 'wake-status';

    function paintStatus() {
      const value = state.wakeTimes[dateStr];
      if (!value) { status.textContent = ''; status.className = 'wake-status'; return; }
      const diff = minutesOf(value) - minutesOf(step.wakeWindow.to);
      if (diff <= 0) {
        status.textContent = '✓ En ventana';
        status.className = 'wake-status ok';
      } else {
        status.textContent = `▲ ${diff} min tarde`;
        status.className = 'wake-status late';
      }
    }
    paintStatus();

    input.addEventListener('change', () => {
      if (input.value) state.wakeTimes[dateStr] = input.value;
      else delete state.wakeTimes[dateStr];
      saveState();
      paintStatus();
      renderStats();
    });

    row.append(label, input, target, status);
    return row;
  }

  // ---------- stats ----------
  function renderStats() {
    const section = currentSection();
    const body = document.getElementById('stats-body');
    const range = ui(section).range;
    body.innerHTML = '';

    if (!section.steps.length) {
      body.innerHTML = '<div class="empty-state">Agrega algo para ver estadísticas.</div>';
      return;
    }

    if (section.type === 'routine') {
      renderRoutineStats(section, body, range);
    } else {
      renderHabitStats(section, body, range);
    }
  }

  function renderRoutineStats(section, body, range) {
    const suffix = activeDaysLabel(section);
    const chainStreak = streak(section, ds => isComplete(section, ds));
    const pct = Math.round(completeRate(section, range) * 100);
    const wake = wakeStats(section, range);

    const hero = document.createElement('div');
    hero.className = 'hero-tiles';
    hero.innerHTML = `
      <div class="hero-tile">
        <div class="hero-label">Racha actual</div>
        <div class="hero-value">${chainStreak} <span class="hero-unit">${chainStreak === 1 ? 'día' : 'días'}</span></div>
        <div class="stat-sub">Perfect Starts seguidos</div>
      </div>
      <div class="hero-tile">
        <div class="hero-label">Rutina completa</div>
        <div class="hero-value">${pct}<span class="hero-unit">%</span></div>
        <div class="stat-sub">últimos ${range} días${suffix}</div>
        <div class="meter-track"><div class="meter-fill" style="width:${pct}%;background:${colorVar(0)}"></div></div>
      </div>
    `;

    if (wake) {
      const tile = document.createElement('div');
      tile.className = 'hero-tile';
      const avgLabel = wake.avg === null ? '—' : formatMinutes(wake.avg);
      const sub = wake.recorded
        ? `${wake.inWindow}/${wake.recorded} dentro de ventana`
        : 'sin horas registradas aún';
      tile.innerHTML = `
        <div class="hero-label">Despertar promedio</div>
        <div class="hero-value">${avgLabel}</div>
        <div class="stat-sub">${sub}</div>
      `;
      hero.appendChild(tile);
    }
    body.appendChild(hero);

    const rates = section.steps.map(s => ({ step: s, rate: stepRate(section, s.id, range) }));
    const anyData = rates.some(r => r.rate > 0);
    const weakest = anyData ? rates.reduce((a, b) => (b.rate < a.rate ? b : a)) : null;

    const title = document.createElement('p');
    title.className = 'meters-title';
    title.textContent = `Cumplimiento por paso (últimos ${range} días${suffix})`;
    body.appendChild(title);

    const meters = document.createElement('div');
    meters.className = 'step-meters';
    rates.forEach(({ step, rate }) => {
      const p = Math.round(rate * 100);
      const isWeak = weakest && step.id === weakest.step.id && rates.length > 1 && weakest.rate < 1;
      const row = document.createElement('div');
      row.innerHTML = `
        <div class="meter-row-head">
          <span class="habit-dot" style="background:${colorVar(step.colorIdx)}"></span>
          <span>${escapeHtml(step.name)}</span>
          ${isWeak ? '<span class="weak-badge">eslabón más débil</span>' : ''}
          <span class="pct">${p}%</span>
        </div>
        <div class="meter-track"><div class="meter-fill" style="width:${p}%;background:${colorVar(step.colorIdx)}"></div></div>
      `;
      meters.appendChild(row);
    });
    body.appendChild(meters);
  }

  function renderHabitStats(section, body, range) {
    const tiles = document.createElement('div');
    tiles.className = 'stat-tiles';
    section.steps.forEach(step => {
      const s = streak(section, ds => isChecked(ds, step.id));
      const pct = Math.round(stepRate(section, step.id, range) * 100);
      const tile = document.createElement('div');
      tile.className = 'stat-tile';
      tile.innerHTML = `
        <div class="stat-tile-head">
          <span class="habit-dot" style="background:${colorVar(step.colorIdx)}"></span>
          <span>${escapeHtml(step.name)}</span>
        </div>
        <div class="stat-value">${s} ${s === 1 ? 'día' : 'días'} 🔥</div>
        <div class="stat-sub">${pct}% cumplido (${range}d)</div>
        <div class="meter-track"><div class="meter-fill" style="width:${pct}%;background:${colorVar(step.colorIdx)}"></div></div>
      `;
      tiles.appendChild(tile);
    });
    body.appendChild(tiles);
  }

  // ---------- heatmap ----------
  function renderHeatmapSelect(section) {
    const sel = document.getElementById('heatmap-select');
    const prev = ui(section).heatmapFilter;
    sel.innerHTML = '';
    const all = document.createElement('option');
    all.value = 'all';
    all.textContent = section.type === 'routine' ? 'Rutina completa' : 'Todos los hábitos';
    sel.appendChild(all);
    section.steps.forEach(step => {
      const opt = document.createElement('option');
      opt.value = step.id;
      opt.textContent = step.name;
      sel.appendChild(opt);
    });
    sel.value = [...sel.options].some(o => o.value === prev) ? prev : 'all';
    ui(section).heatmapFilter = sel.value;
  }

  function seqColor(frac) {
    if (frac <= 0) return 'var(--gridline)';
    if (frac <= 0.25) return 'var(--seq-100)';
    if (frac <= 0.5) return 'var(--seq-250)';
    if (frac <= 0.75) return 'var(--seq-400)';
    if (frac < 1) return 'var(--seq-550)';
    return 'var(--seq-700)';
  }

  function renderHeatmap() {
    const section = currentSection();
    renderHeatmapSelect(section);
    const filter = ui(section).heatmapFilter;
    const wrap = document.getElementById('heatmap-wrap');
    wrap.innerHTML = '';

    if (!section.steps.length) {
      wrap.innerHTML = '<div class="empty-state">Sin datos todavía.</div>';
      document.getElementById('heatmap-table').innerHTML = '';
      return;
    }

    const step = filter === 'all' ? null : section.steps.find(s => s.id === filter);
    const rows = DOW_LABELS.map((_, i) => i).filter(i => section.activeDays.includes((i + 1) % 7));
    const cell = 12, gap = 3, labelW = 16;
    const weekStart = addDays(startOfWeek(new Date()), -7 * (HEATMAP_WEEKS - 1));
    const width = labelW + HEATMAP_WEEKS * (cell + gap);
    const height = rows.length * (cell + gap);
    const todayStr = dateKey(new Date());

    let svg = `<svg viewBox="0 0 ${width} ${height}" class="heatmap-grid" role="img" aria-label="Calendario de constancia">`;
    rows.forEach((row, rowPos) => {
      const y = rowPos * (cell + gap);
      svg += `<text class="axis-label" x="0" y="${y + cell - 2}">${DOW_LABELS[row]}</text>`;
      for (let w = 0; w < HEATMAP_WEEKS; w++) {
        const d = addDays(weekStart, w * 7 + row);
        const x = labelW + w * (cell + gap);
        if (isFuture(d)) continue;
        const ds = dateKey(d);
        let fill, title;
        if (filter === 'all') {
          const frac = dayFraction(section, ds);
          fill = seqColor(frac);
          title = `${ds}: ${Math.round(frac * 100)}% de la rutina`;
        } else {
          const done = isChecked(ds, filter);
          fill = done ? colorVar(step ? step.colorIdx : 0) : 'var(--gridline)';
          title = `${ds}: ${done ? 'cumplido' : 'no cumplido'}`;
        }
        const ring = ds === todayStr ? ' stroke="var(--text-primary)" stroke-width="1.5"' : '';
        svg += `<rect class="heatmap-cell" x="${x}" y="${y}" width="${cell}" height="${cell}" rx="3" fill="${fill}"${ring}><title>${escapeHtml(title)}</title></rect>`;
      }
    });
    svg += '</svg>';
    wrap.innerHTML = svg;

    const legend = document.createElement('div');
    legend.className = 'heatmap-legend';
    if (filter === 'all') {
      legend.innerHTML = 'Menos ' +
        ['var(--gridline)', 'var(--seq-100)', 'var(--seq-250)', 'var(--seq-400)', 'var(--seq-550)', 'var(--seq-700)']
          .map(c => `<span class="swatch" style="background:${c}"></span>`).join('') +
        ' Más';
    } else {
      legend.innerHTML = `<span class="swatch" style="background:var(--gridline)"></span> No cumplido&nbsp;&nbsp;<span class="swatch" style="background:${colorVar(step ? step.colorIdx : 0)}"></span> Cumplido`;
    }
    wrap.appendChild(legend);

    renderHeatmapTable(section, filter);
  }

  function renderHeatmapTable(section, filter) {
    const tableWrap = document.getElementById('heatmap-table');
    const days = lastActiveDays(section, 30);
    const head = filter === 'all' ? '% de la rutina' : 'Cumplido';
    const rows = days.map(d => {
      const ds = dateKey(d);
      const val = filter === 'all'
        ? `${Math.round(dayFraction(section, ds) * 100)}%`
        : (isChecked(ds, filter) ? 'Sí' : 'No');
      return `<tr><td>${ds}</td><td>${val}</td></tr>`;
    }).join('');
    tableWrap.innerHTML = `<table><thead><tr><th>Fecha</th><th>${head}</th></tr></thead><tbody>${rows}</tbody></table>`;
  }

  // ---------- trend ----------
  function trendSeriesFor(section) {
    const hidden = ui(section).hidden;
    const all = [];
    if (section.type === 'routine') {
      all.push({
        id: AGGREGATE_ID,
        name: 'Rutina completa',
        color: 'var(--text-primary)',
        emphasis: true,
        points: weeklyRate(section, ds => isComplete(section, ds), TREND_WEEKS),
      });
    }
    section.steps.forEach(step => {
      all.push({
        id: step.id,
        name: step.name,
        color: colorVar(step.colorIdx),
        emphasis: false,
        points: weeklyRate(section, ds => isChecked(ds, step.id), TREND_WEEKS),
      });
    });
    return { all, visible: all.filter(s => !hidden.has(s.id)) };
  }

  function renderTrendLegend(section, all) {
    const legend = document.getElementById('trend-legend');
    const hidden = ui(section).hidden;
    legend.innerHTML = '';
    if (all.length < 2) return;
    all.forEach(s => {
      const btn = document.createElement('button');
      btn.className = 'legend-item' + (hidden.has(s.id) ? ' dim' : '');
      btn.type = 'button';
      btn.innerHTML = `<span class="legend-swatch" style="background:${s.color}"></span>${escapeHtml(s.name)}`;
      btn.addEventListener('click', () => {
        if (hidden.has(s.id)) hidden.delete(s.id); else hidden.add(s.id);
        renderTrend();
      });
      legend.appendChild(btn);
    });
  }

  function renderTrend() {
    const section = currentSection();
    const container = document.getElementById('trend-chart');
    if (!section.steps.length) {
      document.getElementById('trend-legend').innerHTML = '';
      container.innerHTML = '<div class="empty-state">Sin datos todavía.</div>';
      document.getElementById('trend-table').innerHTML = '';
      return;
    }

    const { all, visible } = trendSeriesFor(section);
    renderTrendLegend(section, all);

    if (!visible.length) {
      container.innerHTML = '<div class="empty-state">Todo está oculto. Actívalo desde la leyenda.</div>';
      document.getElementById('trend-table').innerHTML = '';
      return;
    }

    const n = TREND_WEEKS;
    const W = 640, H = 220, padL = 40, padT = 12, padB = 22;
    const padR = visible.length <= 4 ? 110 : 16;
    const plotW = W - padL - padR, plotH = H - padT - padB;
    const xAt = i => padL + (n <= 1 ? 0 : (i / (n - 1)) * plotW);
    const yAt = v => padT + (1 - v) * plotH;

    let svg = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Tendencia semanal de cumplimiento">`;
    [0, 0.25, 0.5, 0.75, 1].forEach(v => {
      const y = yAt(v);
      svg += `<line class="grid-line" x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}"></line>`;
      svg += `<text class="axis-label" x="${padL - 6}" y="${y + 3}" text-anchor="end">${Math.round(v * 100)}%</text>`;
    });
    [0, Math.floor((n - 1) / 2), n - 1].forEach(i => {
      const d = visible[0].points[i] && visible[0].points[i].weekStart;
      if (!d) return;
      svg += `<text class="axis-label" x="${xAt(i)}" y="${H - 4}" text-anchor="middle">${shortDate(d)}</text>`;
    });

    visible.forEach(s => {
      const pathD = s.points.map((p, i) => `${i === 0 ? 'M' : 'L'}${xAt(i).toFixed(1)},${yAt(p.rate).toFixed(1)}`).join(' ');
      svg += `<path d="${pathD}" fill="none" stroke="${s.color}" stroke-width="${s.emphasis ? 3 : 2}" stroke-linecap="round" stroke-linejoin="round"></path>`;
      const last = s.points[s.points.length - 1];
      svg += `<circle cx="${xAt(n - 1)}" cy="${yAt(last.rate)}" r="${s.emphasis ? 3.5 : 2.5}" fill="${s.color}"></circle>`;
    });

    if (visible.length <= 4) {
      const MIN_GAP = 11, top = padT + 4, bottom = H - padB - 4;
      const labels = visible
        .map(s => ({ s, y: yAt(s.points[s.points.length - 1].rate) }))
        .sort((a, b) => a.y - b.y);
      for (let i = 1; i < labels.length; i++) {
        if (labels[i].y - labels[i - 1].y < MIN_GAP) labels[i].y = labels[i - 1].y + MIN_GAP;
      }
      const overflow = labels[labels.length - 1].y - bottom;
      if (overflow > 0) labels.forEach(l => { l.y -= overflow; });
      if (labels[0].y < top) labels.forEach(l => { l.y += top - labels[0].y; });
      labels.forEach(({ s, y }) => {
        svg += `<text class="axis-label" x="${xAt(n - 1) + 6}" y="${y + 3}" fill="${s.color}" style="font-weight:600">${escapeHtml(s.name)}</text>`;
      });
    }

    const colW = plotW / Math.max(n - 1, 1);
    for (let i = 0; i < n; i++) {
      svg += `<rect class="hover-col" data-i="${i}" x="${xAt(i) - colW / 2}" y="${padT}" width="${colW}" height="${plotH}" fill="transparent"></rect>`;
    }
    svg += '</svg>';
    container.innerHTML = svg;

    const tooltip = document.createElement('div');
    tooltip.className = 'trend-tooltip';
    container.appendChild(tooltip);

    const svgEl = container.querySelector('svg');
    svgEl.querySelectorAll('.hover-col').forEach(rect => {
      const show = () => showTooltip(rect, visible, tooltip, svgEl, xAt);
      rect.addEventListener('mouseenter', show);
      rect.addEventListener('mousemove', show);
      rect.addEventListener('mouseleave', () => { tooltip.style.display = 'none'; });
    });

    renderTrendTable(visible);
  }

  function showTooltip(rect, series, tooltip, svgEl, xAt) {
    const i = Number(rect.dataset.i);
    if (!series.length) return;
    let html = `<strong>Semana del ${shortDate(series[0].points[i].weekStart)}</strong><br>`;
    series.forEach(s => { html += `${Math.round(s.points[i].rate * 100)}% ${escapeHtml(s.name)}<br>`; });
    tooltip.innerHTML = html;
    tooltip.style.display = 'block';
    const svgRect = svgEl.getBoundingClientRect();
    const px = xAt(i) * (svgRect.width / svgEl.viewBox.baseVal.width);
    tooltip.style.left = Math.min(Math.max(px - 50, 0), Math.max(svgRect.width - 150, 0)) + 'px';
    tooltip.style.top = '2px';
  }

  function renderTrendTable(series) {
    const wrap = document.getElementById('trend-table');
    if (!series.length) { wrap.innerHTML = ''; return; }
    const n = series[0].points.length;
    const head = '<tr><th>Semana</th>' + series.map(s => `<th>${escapeHtml(s.name)}</th>`).join('') + '</tr>';
    let rows = '';
    for (let i = 0; i < n; i++) {
      rows += `<tr><td>${shortDate(series[0].points[i].weekStart)}</td>` +
        series.map(s => `<td>${Math.round(s.points[i].rate * 100)}%</td>`).join('') + '</tr>';
    }
    wrap.innerHTML = `<table><thead>${head}</thead><tbody>${rows}</tbody></table>`;
  }

  // ---------- wiring ----------
  function renderAll() {
    renderTabs();
    renderDatePicker();
    renderCheckin();
    renderRangeChips();
    renderStats();
    renderHeatmap();
    renderTrend();
  }

  function renderRangeChips() {
    const range = ui(currentSection()).range;
    document.querySelectorAll('.chip').forEach(chip => {
      chip.classList.toggle('active', Number(chip.dataset.range) === range);
    });
  }

  document.getElementById('prev-day').addEventListener('click', () => {
    viewDate = addDays(viewDate, -1);
    renderDatePicker();
    renderCheckin();
  });
  document.getElementById('next-day').addEventListener('click', () => {
    const next = addDays(viewDate, 1);
    if (isFuture(next)) return;
    viewDate = next;
    renderDatePicker();
    renderCheckin();
  });
  document.getElementById('today-btn').addEventListener('click', () => {
    viewDate = new Date();
    renderDatePicker();
    renderCheckin();
  });
  document.getElementById('date-picker').addEventListener('change', e => {
    if (!e.target.value) return;
    const [y, m, d] = e.target.value.split('-').map(Number);
    const picked = new Date(y, m - 1, d);
    if (isFuture(picked)) { renderDatePicker(); return; }
    viewDate = picked;
    renderDatePicker();
    renderCheckin();
  });

  document.getElementById('add-item-form').addEventListener('submit', e => {
    e.preventDefault();
    const input = document.getElementById('new-item-name');
    const name = input.value.trim();
    if (!name) return;
    addStep(currentSection(), name);
    input.value = '';
    renderAll();
  });

  document.querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', () => {
      ui(currentSection()).range = Number(chip.dataset.range);
      renderRangeChips();
      renderStats();
    });
  });

  document.getElementById('heatmap-select').addEventListener('change', e => {
    ui(currentSection()).heatmapFilter = e.target.value;
    renderHeatmap();
  });
  document.getElementById('heatmap-table-toggle').addEventListener('click', () => {
    const t = document.getElementById('heatmap-table');
    t.hidden = !t.hidden;
  });
  document.getElementById('trend-table-toggle').addEventListener('click', () => {
    const t = document.getElementById('trend-table');
    t.hidden = !t.hidden;
  });

  function applyStoredTheme() {
    try {
      const saved = localStorage.getItem(THEME_KEY);
      if (saved) document.documentElement.dataset.theme = saved;
    } catch (e) { /* private browsing or blocked storage: default theme applies */ }
  }
  document.getElementById('theme-toggle').addEventListener('click', () => {
    const current = document.documentElement.dataset.theme;
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const isDark = current ? current === 'dark' : prefersDark;
    const next = isDark ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem(THEME_KEY, next); } catch (e) { /* ignore */ }
  });

  applyStoredTheme();
  renderAll();
})();
