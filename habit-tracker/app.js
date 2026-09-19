(function () {
  'use strict';

  const STORAGE_KEY = 'habit-tracker-v1';
  const THEME_KEY = 'habit-tracker-theme';
  const SERIES_VARS = ['--series-1', '--series-2', '--series-3', '--series-4', '--series-5', '--series-6', '--series-7', '--series-8'];
  const HEATMAP_WEEKS = 18;
  const TREND_WEEKS = 12;

  const DEFAULT_HABITS = [
    { id: 'ejercicio', name: 'Ejercicio', colorIdx: 0 },
    { id: 'lectura', name: 'Lectura', colorIdx: 1 },
    { id: 'agua', name: 'Agua', colorIdx: 2 },
    { id: 'sueno', name: 'Sueño', colorIdx: 3 },
  ];

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.habits) && parsed.checkins) return parsed;
      }
    } catch (e) { /* corrupted or unavailable storage: fall back to defaults */ }
    return { habits: DEFAULT_HABITS.slice(), checkins: {} };
  }

  let state = loadState();
  let viewDate = new Date();
  let hiddenSeries = new Set();
  let statsRange = 7;

  function saveState() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
    catch (e) { /* storage full or unavailable: state stays in memory only */ }
  }

  // ---------- date helpers ----------
  function dateKey(d) {
    const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  function addDays(d, n) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
  function startOfWeek(d) {
    const r = new Date(d);
    const dow = (r.getDay() + 6) % 7; // Monday = 0
    r.setDate(r.getDate() - dow);
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

  // ---------- state mutations ----------
  function setCheckin(dateStr, habitId, value) {
    if (!state.checkins[dateStr]) state.checkins[dateStr] = {};
    state.checkins[dateStr][habitId] = value;
    saveState();
  }
  function addHabit(name) {
    const id = 'h' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const colorIdx = state.habits.length % SERIES_VARS.length;
    state.habits.push({ id, name, colorIdx });
    saveState();
  }
  function removeHabit(id) {
    state.habits = state.habits.filter(h => h.id !== id);
    saveState();
  }

  // ---------- derived stats ----------
  function isChecked(dateStr, habitId) {
    return !!(state.checkins[dateStr] && state.checkins[dateStr][habitId]);
  }
  function currentStreak(habitId) {
    let d = new Date();
    if (!isChecked(dateKey(d), habitId)) d = addDays(d, -1);
    let count = 0;
    while (isChecked(dateKey(d), habitId)) { count++; d = addDays(d, -1); }
    return count;
  }
  function completionRate(habitId, days) {
    let done = 0;
    let d = new Date();
    for (let i = 0; i < days; i++) {
      if (isChecked(dateKey(d), habitId)) done++;
      d = addDays(d, -1);
    }
    return done / days;
  }
  function dayCompletionFraction(dateStr) {
    if (!state.habits.length) return 0;
    const day = state.checkins[dateStr];
    if (!day) return 0;
    let done = 0;
    state.habits.forEach(h => { if (day[h.id]) done++; });
    return done / state.habits.length;
  }
  function weeklyCompletion(habitId, weeksBack) {
    const thisWeekStart = startOfWeek(new Date());
    const out = [];
    for (let w = weeksBack - 1; w >= 0; w--) {
      const start = addDays(thisWeekStart, -7 * w);
      let done = 0, total = 0;
      for (let i = 0; i < 7; i++) {
        const d = addDays(start, i);
        if (isFuture(d)) break;
        total++;
        if (isChecked(dateKey(d), habitId)) done++;
      }
      out.push({ weekStart: start, rate: total ? done / total : 0 });
    }
    return out;
  }

  // ---------- today panel ----------
  function renderDatePicker() {
    const picker = document.getElementById('date-picker');
    picker.value = dateKey(viewDate);
    picker.max = dateKey(new Date());
    document.getElementById('next-day').disabled = dateKey(viewDate) === dateKey(new Date());
  }

  function renderHabitList() {
    const list = document.getElementById('habit-list');
    list.innerHTML = '';
    const dateStr = dateKey(viewDate);
    if (!state.habits.length) {
      list.innerHTML = '<li class="empty-state">Aún no tienes hábitos. Agrega el primero abajo.</li>';
      return;
    }
    state.habits.forEach(h => {
      const li = document.createElement('li');
      li.className = 'habit-row';

      const dot = document.createElement('span');
      dot.className = 'habit-dot';
      dot.style.background = colorVar(h.colorIdx);

      const name = document.createElement('span');
      name.className = 'habit-name';
      name.textContent = h.name;

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'habit-check';
      checkbox.checked = isChecked(dateStr, h.id);
      checkbox.setAttribute('aria-label', `${h.name} - ${dateStr}`);
      checkbox.addEventListener('change', () => {
        setCheckin(dateStr, h.id, checkbox.checked);
        renderStats();
        renderHeatmap();
        renderTrend();
      });

      const removeBtn = document.createElement('button');
      removeBtn.className = 'habit-remove';
      removeBtn.type = 'button';
      removeBtn.textContent = '✕';
      removeBtn.setAttribute('aria-label', `Eliminar ${h.name}`);
      removeBtn.addEventListener('click', () => {
        if (confirm(`¿Eliminar el hábito "${h.name}"? Se perderá su historial.`)) {
          removeHabit(h.id);
          renderAll();
        }
      });

      li.append(dot, name, checkbox, removeBtn);
      list.appendChild(li);
    });
  }

  // ---------- stat tiles ----------
  function renderStats() {
    const wrap = document.getElementById('stat-tiles');
    wrap.innerHTML = '';
    if (!state.habits.length) {
      wrap.innerHTML = '<div class="empty-state">Agrega un hábito para ver estadísticas.</div>';
      return;
    }
    state.habits.forEach(h => {
      const streak = currentStreak(h.id);
      const pct = Math.round(completionRate(h.id, statsRange) * 100);
      const tile = document.createElement('div');
      tile.className = 'stat-tile';
      tile.innerHTML = `
        <div class="stat-tile-head">
          <span class="habit-dot" style="background:${colorVar(h.colorIdx)}"></span>
          <span>${escapeHtml(h.name)}</span>
        </div>
        <div class="stat-value">${streak} ${streak === 1 ? 'día' : 'días'} 🔥</div>
        <div class="stat-sub">${pct}% cumplido (${statsRange}d)</div>
        <div class="meter-track"><div class="meter-fill" style="width:${pct}%;background:${colorVar(h.colorIdx)}"></div></div>
      `;
      wrap.appendChild(tile);
    });
  }

  // ---------- heatmap ----------
  function renderHeatmapSelect() {
    const sel = document.getElementById('heatmap-habit-select');
    const prevVal = sel.value;
    sel.innerHTML = '';
    const allOpt = document.createElement('option');
    allOpt.value = 'all';
    allOpt.textContent = 'Todos los hábitos';
    sel.appendChild(allOpt);
    state.habits.forEach(h => {
      const opt = document.createElement('option');
      opt.value = h.id;
      opt.textContent = h.name;
      sel.appendChild(opt);
    });
    if ([...sel.options].some(o => o.value === prevVal)) sel.value = prevVal;
  }

  function buildHeatmapWeeks() {
    const end = startOfWeek(new Date());
    const start = addDays(end, -7 * (HEATMAP_WEEKS - 1));
    const weeks = [];
    for (let w = 0; w < HEATMAP_WEEKS; w++) {
      const col = [];
      for (let d = 0; d < 7; d++) col.push(addDays(start, w * 7 + d));
      weeks.push(col);
    }
    return weeks;
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
    renderHeatmapSelect();
    const sel = document.getElementById('heatmap-habit-select');
    const habitId = sel.value || 'all';
    const wrap = document.getElementById('heatmap-wrap');
    const weeks = buildHeatmapWeeks();
    const cell = 12, gap = 3;
    const width = weeks.length * (cell + gap);
    const height = 7 * (cell + gap);
    const todayStr = dateKey(new Date());
    const habit = habitId === 'all' ? null : state.habits.find(h => h.id === habitId);

    let svg = `<svg viewBox="0 0 ${width} ${height}" class="heatmap-grid" role="img" aria-label="Calendario de constancia">`;
    weeks.forEach((col, w) => {
      col.forEach((d, row) => {
        const ds = dateKey(d);
        const x = w * (cell + gap), y = row * (cell + gap);
        if (isFuture(d)) {
          svg += `<rect x="${x}" y="${y}" width="${cell}" height="${cell}" rx="3" fill="transparent"></rect>`;
          return;
        }
        let fill, title;
        if (habitId === 'all') {
          const frac = dayCompletionFraction(ds);
          fill = seqColor(frac);
          title = `${ds}: ${Math.round(frac * 100)}% cumplido`;
        } else {
          const done = isChecked(ds, habitId);
          fill = done ? colorVar(habit ? habit.colorIdx : 0) : 'var(--gridline)';
          title = `${ds}: ${done ? 'cumplido' : 'no cumplido'}`;
        }
        const ring = ds === todayStr ? ' stroke="var(--text-primary)" stroke-width="1.5"' : '';
        svg += `<rect class="heatmap-cell" x="${x}" y="${y}" width="${cell}" height="${cell}" rx="3" fill="${fill}"${ring}><title>${escapeHtml(title)}</title></rect>`;
      });
    });
    svg += `</svg>`;
    wrap.innerHTML = svg;

    const legend = document.createElement('div');
    legend.className = 'heatmap-legend';
    if (habitId === 'all') {
      legend.innerHTML = 'Menos ' +
        ['var(--gridline)', 'var(--seq-100)', 'var(--seq-250)', 'var(--seq-400)', 'var(--seq-550)', 'var(--seq-700)']
          .map(c => `<span class="swatch" style="background:${c}"></span>`).join('') +
        ' Más';
    } else {
      legend.innerHTML = `<span class="swatch" style="background:var(--gridline)"></span> No cumplido&nbsp;&nbsp;<span class="swatch" style="background:${colorVar(habit ? habit.colorIdx : 0)}"></span> Cumplido`;
    }
    wrap.appendChild(legend);

    renderHeatmapTable(weeks, habitId, habit);
  }

  function renderHeatmapTable(weeks, habitId, habit) {
    const tableWrap = document.getElementById('heatmap-table');
    const flat = weeks.flat().filter(d => !isFuture(d)).slice(-30);
    const valueHead = habitId === 'all' ? '% cumplido' : 'Cumplido';
    const rows = flat.map(d => {
      const ds = dateKey(d);
      const val = habitId === 'all'
        ? `${Math.round(dayCompletionFraction(ds) * 100)}%`
        : (isChecked(ds, habitId) ? 'Sí' : 'No');
      return `<tr><td>${ds}</td><td>${val}</td></tr>`;
    }).join('');
    tableWrap.innerHTML = `<table><thead><tr><th>Fecha</th><th>${valueHead}</th></tr></thead><tbody>${rows}</tbody></table>`;
  }

  // ---------- trend chart ----------
  function renderTrendLegend() {
    const legend = document.getElementById('trend-legend');
    legend.innerHTML = '';
    if (state.habits.length < 2) { return; }
    state.habits.forEach(h => {
      const btn = document.createElement('button');
      btn.className = 'legend-item' + (hiddenSeries.has(h.id) ? ' dim' : '');
      btn.type = 'button';
      btn.innerHTML = `<span class="legend-swatch" style="background:${colorVar(h.colorIdx)}"></span>${escapeHtml(h.name)}`;
      btn.addEventListener('click', () => {
        if (hiddenSeries.has(h.id)) hiddenSeries.delete(h.id); else hiddenSeries.add(h.id);
        renderTrend();
      });
      legend.appendChild(btn);
    });
  }

  function renderTrend() {
    renderTrendLegend();
    const container = document.getElementById('trend-chart');
    if (!state.habits.length) {
      container.innerHTML = '<div class="empty-state">Agrega un hábito para ver la tendencia.</div>';
      renderTrendTable([]);
      return;
    }

    const visible = state.habits.filter(h => !hiddenSeries.has(h.id));
    const series = visible.map(h => ({ habit: h, points: weeklyCompletion(h.id, TREND_WEEKS) }));
    const n = TREND_WEEKS;

    if (!series.length) {
      container.innerHTML = '<div class="empty-state">Todos los hábitos están ocultos. Actívalos desde la leyenda.</div>';
      renderTrendTable([]);
      return;
    }

    const W = 640, H = 220, padL = 40, padT = 12, padB = 22;
    const padR = visible.length <= 4 ? 76 : 16;
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
      const d = series[0].points[i] && series[0].points[i].weekStart;
      if (!d) return;
      svg += `<text class="axis-label" x="${xAt(i)}" y="${H - 4}" text-anchor="middle">${d.toLocaleDateString('es', { day: 'numeric', month: 'short' })}</text>`;
    });

    series.forEach(s => {
      const c = colorVar(s.habit.colorIdx);
      const pathD = s.points.map((p, i) => `${i === 0 ? 'M' : 'L'}${xAt(i).toFixed(1)},${yAt(p.rate).toFixed(1)}`).join(' ');
      svg += `<path d="${pathD}" fill="none" stroke="${c}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>`;
      const last = s.points[s.points.length - 1];
      svg += `<circle cx="${xAt(n - 1)}" cy="${yAt(last.rate)}" r="2.5" fill="${c}"></circle>`;
    });

    if (visible.length <= 4) {
      const MIN_GAP = 11;
      const top = padT + 4, bottom = H - padB - 4;
      const labels = series
        .map(s => ({ s, y: yAt(s.points[s.points.length - 1].rate) }))
        .sort((a, b) => a.y - b.y);
      for (let i = 1; i < labels.length; i++) {
        if (labels[i].y - labels[i - 1].y < MIN_GAP) labels[i].y = labels[i - 1].y + MIN_GAP;
      }
      const overflow = labels[labels.length - 1].y - bottom;
      if (overflow > 0) labels.forEach(l => { l.y -= overflow; });
      if (labels[0].y < top) labels.forEach(l => { l.y += top - labels[0].y; });
      labels.forEach(({ s, y }) => {
        const c = colorVar(s.habit.colorIdx);
        svg += `<text class="axis-label" x="${xAt(n - 1) + 6}" y="${y + 3}" fill="${c}" style="font-weight:600">${escapeHtml(s.habit.name)}</text>`;
      });
    }

    const colW = plotW / Math.max(n - 1, 1);
    for (let i = 0; i < n; i++) {
      svg += `<rect class="hover-col" data-i="${i}" x="${xAt(i) - colW / 2}" y="${padT}" width="${colW}" height="${plotH}" fill="transparent"></rect>`;
    }
    svg += `</svg>`;
    container.innerHTML = svg;

    const tooltip = document.createElement('div');
    tooltip.className = 'trend-tooltip';
    container.appendChild(tooltip);

    const svgEl = container.querySelector('svg');
    svgEl.querySelectorAll('.hover-col').forEach(rect => {
      const show = evt => showTooltip(rect, series, tooltip, svgEl, xAt);
      rect.addEventListener('mouseenter', show);
      rect.addEventListener('mousemove', show);
      rect.addEventListener('mouseleave', () => { tooltip.style.display = 'none'; });
    });

    renderTrendTable(series);
  }

  function showTooltip(rect, series, tooltip, svgEl, xAt) {
    const i = Number(rect.dataset.i);
    if (!series.length) return;
    const weekLabel = series[0].points[i].weekStart.toLocaleDateString('es', { day: 'numeric', month: 'short' });
    let html = `<strong>Semana del ${weekLabel}</strong><br>`;
    series.forEach(s => { html += `${Math.round(s.points[i].rate * 100)}% ${escapeHtml(s.habit.name)}<br>`; });
    tooltip.innerHTML = html;
    tooltip.style.display = 'block';
    const svgRect = svgEl.getBoundingClientRect();
    const scale = svgRect.width / svgEl.viewBox.baseVal.width;
    const px = xAt(i) * scale;
    tooltip.style.left = Math.min(Math.max(px - 50, 0), svgRect.width - 130) + 'px';
    tooltip.style.top = '2px';
  }

  function renderTrendTable(series) {
    const wrap = document.getElementById('trend-table');
    if (!series.length) { wrap.innerHTML = ''; return; }
    const n = series[0].points.length;
    let head = '<tr><th>Semana</th>' + series.map(s => `<th>${escapeHtml(s.habit.name)}</th>`).join('') + '</tr>';
    let rows = '';
    for (let i = 0; i < n; i++) {
      rows += `<tr><td>${series[0].points[i].weekStart.toLocaleDateString('es', { day: 'numeric', month: 'short' })}</td>` +
        series.map(s => `<td>${Math.round(s.points[i].rate * 100)}%</td>`).join('') + '</tr>';
    }
    wrap.innerHTML = `<table><thead>${head}</thead><tbody>${rows}</tbody></table>`;
  }

  // ---------- init & wiring ----------
  function renderAll() {
    renderDatePicker();
    renderHabitList();
    renderStats();
    renderHeatmap();
    renderTrend();
  }

  document.getElementById('prev-day').addEventListener('click', () => {
    viewDate = addDays(viewDate, -1);
    renderDatePicker();
    renderHabitList();
  });
  document.getElementById('next-day').addEventListener('click', () => {
    const next = addDays(viewDate, 1);
    if (isFuture(next)) return;
    viewDate = next;
    renderDatePicker();
    renderHabitList();
  });
  document.getElementById('today-btn').addEventListener('click', () => {
    viewDate = new Date();
    renderDatePicker();
    renderHabitList();
  });
  document.getElementById('date-picker').addEventListener('change', e => {
    if (!e.target.value) return;
    const [y, m, d] = e.target.value.split('-').map(Number);
    const picked = new Date(y, m - 1, d);
    if (isFuture(picked)) { renderDatePicker(); return; }
    viewDate = picked;
    renderDatePicker();
    renderHabitList();
  });

  document.getElementById('add-habit-form').addEventListener('submit', e => {
    e.preventDefault();
    const input = document.getElementById('new-habit-name');
    const name = input.value.trim();
    if (!name) return;
    addHabit(name);
    input.value = '';
    renderAll();
  });

  document.querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      statsRange = Number(chip.dataset.range);
      renderStats();
    });
  });

  document.getElementById('heatmap-habit-select').addEventListener('change', renderHeatmap);
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
