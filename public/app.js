(function () {
  'use strict';

  // Intl formatters
  const fmtTRY = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', minimumFractionDigits: 2 });
  const fmtUSD = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });
  const fmtPct1 = new Intl.NumberFormat('en-US', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const fmt1 = new Intl.NumberFormat('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const fmt2 = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // DOM refs
  const els = {
    inflationText: document.getElementById('inflationJsonText'),
    inflationFile: document.getElementById('inflationFile'),
    usdtryText: document.getElementById('usdtryJsonText'),
    usdtryFile: document.getElementById('usdtryFile'),
    salary: document.getElementById('salaryInput'),
    startMonth: document.getElementById('startMonthInput'),
    whatIfMonth: document.getElementById('whatIfMonthInput'),
    whatIfPct: document.getElementById('whatIfPctInput'),
    validateBtn: document.getElementById('validateBtn'),
    exportCsvBtn: document.getElementById('exportCsvBtn'),
    themeToggle: document.getElementById('themeToggle'),
    warnings: document.getElementById('warnings'),
    tableBody: document.querySelector('#dataTable tbody'),
    cards: {
      totalInflation: document.querySelector('#card-totalInflation .value'),
      requiredRaise: document.querySelector('#card-requiredRaise .value'),
      usdSalary: document.querySelector('#card-usdSalary .value'),
      purchPower: document.querySelector('#card-purchPower .value'),
    },
    charts: {
      requiredActual: document.getElementById('chartRequiredActual'),
      real: document.getElementById('chartReal'),
      usd: document.getElementById('chartUsd'),
    }
  };

  // Helpers: month handling
  function isValidMonthStr(s) { return /^\d{4}-\d{2}$/.test(s) && +s.slice(5, 7) >= 1 && +s.slice(5, 7) <= 12; }
  function monthCmp(a, b) { return a.localeCompare(b); }
  function nextMonth(s) {
    const y = +s.slice(0, 4), m = +s.slice(5, 7);
    const m2 = m === 12 ? 1 : m + 1; const y2 = m === 12 ? y + 1 : y;
    return String(y2).padStart(4, '0') + '-' + String(m2).padStart(2, '0');
  }
  function monthsBetweenInclusive(a, b) {
    const arr = [a];
    while (arr[arr.length - 1] !== b) {
      const nm = nextMonth(arr[arr.length - 1]);
      if (arr.length > 1000) throw new Error('Month loop guard');
      arr.push(nm);
    }
    return arr;
  }

  function readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onerror = () => reject(fr.error);
      fr.onload = () => resolve(String(fr.result || ''));
      fr.readAsText(file);
    });
  }

  // Validation helpers
  function ensureContinuousAscending(months) {
    for (let i = 1; i < months.length; i++) {
      if (monthCmp(months[i - 1], months[i]) >= 0) throw new Error('Months must be strictly ascending.');
      if (months[i] !== nextMonth(months[i - 1])) throw new Error('Months have gaps: expected ' + nextMonth(months[i - 1]) + ' after ' + months[i - 1]);
    }
  }

  // Pure functions
  function parseInflationCollections(jsonText) {
    let data;
    try { data = JSON.parse(jsonText); } catch (e) { throw new Error('Inflation JSON is malformed: ' + e.message); }
    // Accept either legacy { series: [...] } or new { TUIK: {series: [...]}, ENAG: {series: [...]}} structure
    const collections = {};
    if (data && Array.isArray(data.series)) {
      collections.default = data.series;
    } else if (data && (data.TUIK || data.ENAG)) {
      if (data.TUIK && Array.isArray(data.TUIK.series)) collections.TUIK = data.TUIK.series;
      if (data.ENAG && Array.isArray(data.ENAG.series)) collections.ENAG = data.ENAG.series;
    } else {
      throw new Error('Inflation JSON must have either a series array or TUIK/ENAG objects.');
    }

    function validateSeries(arr, label) {
      const rows = arr.map((r, i) => {
        if (!r || typeof r !== 'object') throw new Error(label + ' series item #' + (i + 1) + ' must be an object.');
        const { month, inflationPct } = r;
        if (!isValidMonthStr(month)) throw new Error('Invalid month in ' + label + ' at index ' + i + ': ' + month);
        const v = Number(inflationPct);
        if (!Number.isFinite(v)) throw new Error(label + ' inflationPct must be a number at ' + month);
        if (Math.abs(v) > 50) throw new Error(label + ' inflationPct exceeds ±50% at ' + month);
        return { month, inflationPct: v };
      });
      rows.sort((a, b) => monthCmp(a.month, b.month));
      const months = rows.map(r => r.month);
      const set = new Set(months);
      if (set.size !== months.length) throw new Error(label + ' months contain duplicates.');
      ensureContinuousAscending(months);
      return rows;
    }

    const validated = {};
    for (const key of Object.keys(collections)) {
      validated[key] = validateSeries(collections[key], key === 'default' ? 'inflation' : key);
    }
    // Create synthetic AVG if both TUIK & ENAG exist and months align
    if (validated.TUIK && validated.ENAG) {
      const t = validated.TUIK;
      const e = validated.ENAG;
      if (t.length === e.length && t.every((row, i) => row.month === e[i].month)) {
        validated.AVG = t.map((row, i) => ({ month: row.month, inflationPct: (row.inflationPct + e[i].inflationPct) / 2 }));
      }
    }
    return validated; // { TUIK, ENAG, AVG } or { default }
  }

  function parseAndValidateUsdTry(jsonText) {
    let data;
    try { data = JSON.parse(jsonText); } catch (e) { throw new Error('USD/TRY JSON is malformed: ' + e.message); }
    if (!data || !Array.isArray(data.series)) throw new Error('USD/TRY JSON must have a series array.');
    const rows = data.series.map((r, i) => {
      if (!r || typeof r !== 'object') throw new Error('USD/TRY series item #' + (i + 1) + ' must be an object.');
      const { month, usdtry } = r;
      if (!isValidMonthStr(month)) throw new Error('Invalid month in USD/TRY at index ' + i + ': ' + month);
      const v = Number(usdtry);
      if (!Number.isFinite(v) || v <= 0) throw new Error('usdtry must be > 0 at ' + month);
      return { month, usdtry: v };
    });
    const months = rows.map(r => r.month);
    const set = new Set(months);
    if (set.size !== months.length) throw new Error('USD/TRY months contain duplicates.');
    rows.sort((a, b) => monthCmp(a.month, b.month));
    ensureContinuousAscending(rows.map(r => r.month));
    return rows;
  }

  function alignByCommonMonths(infl, fx) {
    const start = infl[0].month > fx[0].month ? infl[0].month : fx[0].month;
    const end = infl[infl.length - 1].month < fx[fx.length - 1].month ? infl[infl.length - 1].month : fx[fx.length - 1].month;
    if (monthCmp(start, end) > 0) return { months: [], inflationPct: [], usdtry: [], warning: 'No overlapping months between series. Please provide matching ranges.' };
    const months = monthsBetweenInclusive(start, end);
    const mapInfl = new Map(infl.map(r => [r.month, r.inflationPct]));
    const mapFx = new Map(fx.map(r => [r.month, r.usdtry]));
    const inflationPct = []; const usdtry = [];
    for (const m of months) {
      if (!mapInfl.has(m) || !mapFx.has(m)) {
        // this shouldn't happen due to continuous checks, but guard anyway
        return { months: [], inflationPct: [], usdtry: [], warning: 'Gaps appear after alignment. Please ensure continuous, matching months.' };
      }
      inflationPct.push(mapInfl.get(m));
      usdtry.push(mapFx.get(m));
    }
    const truncated = (infl.length + fx.length) - (months.length * 2);
    const warning = truncated > 0 ? `Using common range: ${start} … ${end} (${truncated} months truncated).` : '';
    return { months, inflationPct, usdtry, warning };
  }

  function computeSeries({ months, inflationPct, usdtry, S0, whatIfPct, whatIfMonthIndex }) {
    const n = months.length;
    const CPI = new Array(n).fill(0);
    if (n > 0) {
      // Include month 0 MoM inflation in the chain (interpreting MoM for the labeled month)
      CPI[0] = 100 * (1 + (inflationPct[0] / 100));
      for (let i = 1; i < n; i++) {
        CPI[i] = CPI[i - 1] * (1 + (inflationPct[i] / 100));
      }
    }
    const CPI0 = 100; // baseline index
    const cumInf = CPI.map(v => (v / CPI0) - 1);
    const S_req = CPI.map(v => S0 * (v / CPI0));
    const S_actual = new Array(n);
    for (let i = 0; i < n; i++) {
      S_actual[i] = i >= whatIfMonthIndex ? S0 * (1 + whatIfPct / 100) : S0;
    }
    const S_real = S_actual.map((v, i) => v / (CPI[i] / CPI0));
    const gapPct = S_actual.map((v, i) => (v / S_req[i]) - 1);
    const L = n - 1;
    const requiredRaiseTodayPct = (S_req[L] / S_actual[L]) - 1;
    const S_usd = S_actual.map((v, i) => v / usdtry[i]);
    return { CPI, cumInf, S_req, S_actual, S_real, gapPct, requiredRaiseTodayPct, S_usd };
  }

  function toCsv(rows) {
    const header = ['Month', 'MoM Inflation %', 'CPI Index', 'Cumulative Inflation %', 'Nominal Salary (TRY)', 'Required Salary (TRY)', 'Gap vs Required %', 'Real Salary (TRY)', 'USD/TRY', 'Salary (USD)'];
    const esc = (s) => '"' + String(s).replace(/"/g, '""') + '"';
    const body = rows.map(r => [
      r.month,
      r.inflationPct.toFixed(2),
      r.cpi.toFixed(2),
      (r.cumInf * 100).toFixed(2),
      r.nominal.toFixed(2),
      r.required.toFixed(2),
      (r.gapPct * 100).toFixed(2),
      r.real.toFixed(2),
      r.usdtry.toFixed(4),
      r.usd.toFixed(2)
    ].map(esc).join(','));
    return [header.map(esc).join(','), ...body].join('\n');
  }

  // Rendering
  let charts = { reqAct: null, real: null, usd: null };
  let currentTheme = 'light';

  function showWarning(msg) {
    if (!msg) { clearWarnings(); return; }
    els.warnings.hidden = false;
    els.warnings.innerHTML = `<button class="dismiss" aria-label="Dismiss" onclick="this.parentElement.hidden=true">×</button>${msg}`;
  }
  function clearWarnings() { els.warnings.hidden = true; els.warnings.textContent = ''; }

  function renderSummaryCards(metrics) {
    const { cumInfLatest, requiredRaiseTodayPct, usdSalaryLatest, purchPowerVsBasePct } = metrics;
    els.cards.totalInflation.textContent = fmtPct1.format(cumInfLatest);
    els.cards.requiredRaise.textContent = fmtPct1.format(requiredRaiseTodayPct);
    els.cards.usdSalary.textContent = fmtUSD.format(usdSalaryLatest);
    els.cards.purchPower.textContent = fmtPct1.format(purchPowerVsBasePct);
  }

  function renderTable(rows) {
    const tbody = els.tableBody; tbody.innerHTML = '';
    for (const r of rows) {
      const tr = document.createElement('tr');
      const cappedBadge = Math.abs(r.inflationPctRaw) > 50 ? '<span class="badge warn" title="Displayed as ±50%">capped</span>' : '';
      tr.innerHTML = `
        <td>${r.month}</td>
  <td>${(r.inflationPct >= 0 ? '+' : '') + r.inflationPct.toFixed(2)}% ${cappedBadge}</td>
  <td>${fmt2.format(r.cpi)}</td>
  <td>${(r.cumInf >= 0 ? '+' : '') + (r.cumInf * 100).toFixed(2)}%</td>
        <td>${fmtTRY.format(r.nominal)}</td>
        <td>${fmtTRY.format(r.required)}</td>
  <td>${(r.gapPct >= 0 ? '+' : '') + (r.gapPct * 100).toFixed(2)}%</td>
        <td>${fmtTRY.format(r.real)}</td>
        <td>${r.usdtry.toFixed(4)}</td>
        <td>${fmtUSD.format(r.usd)}</td>`;
      tbody.appendChild(tr);
    }
  }

  function renderCharts(months, data) {
    const labels = months;
    const { S_req, S_actual, S_real, S_usd } = data;

    const isDark = currentTheme === 'dark';
    const gridColor = isDark ? 'rgba(203,210,255,0.15)' : 'rgba(15, 23, 42, 0.1)';

    // Chart A: Required vs Actual salary (TRY)
    if (charts.reqAct) charts.reqAct.destroy();
    charts.reqAct = new Chart(els.charts.requiredActual, {
      type: 'line',
      data: {
        labels,
        datasets: [
          { label: 'Required (TRY)', data: S_req, borderColor: '#5dd6a4', backgroundColor: 'transparent', tension: 0.2 },
          { label: 'Actual (TRY)', data: S_actual, borderColor: '#3fb4e5', backgroundColor: 'transparent', tension: 0.2 }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: true }, tooltip: { enabled: true } },
        scales: { x: { grid: { color: gridColor } }, y: { grid: { color: gridColor } } }
      }
    });

    // Chart B: Real salary
    if (charts.real) charts.real.destroy();
    charts.real = new Chart(els.charts.real, {
      type: 'line',
      data: { labels, datasets: [{ label: 'Real Salary (TRY base prices)', data: S_real, borderColor: '#c6a5ff', backgroundColor: 'transparent', tension: 0.2 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: true }, tooltip: { enabled: true } }, scales: { x: { grid: { color: gridColor } }, y: { grid: { color: gridColor } } } }
    });

    // Chart C: USD
    if (charts.usd) charts.usd.destroy();
    charts.usd = new Chart(els.charts.usd, {
      type: 'line',
      data: { labels, datasets: [{ label: 'Salary (USD)', data: S_usd, borderColor: '#ffd166', backgroundColor: 'transparent', tension: 0.2 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: true }, tooltip: { enabled: true } }, scales: { x: { grid: { color: gridColor } }, y: { grid: { color: gridColor } } } }
    });
  }

  // State & logic
  let aligned = null; // { months, inflationPct, usdtry }
  let inflationSets = null; // { TUIK: [...], ENAG: [...]} or { default: [...] }
  let activeInflationKey = 'default';
  let base = { S0: 0, startMonth: null };
  let whatIf = { pct: 0, month: null };

  function clampWhatIfMonth(month) {
    if (!aligned || aligned.months.length === 0) return month;
    if (monthCmp(month, aligned.months[0]) < 0) return aligned.months[0];
    const last = aligned.months[aligned.months.length - 1];
    if (monthCmp(month, last) > 0) return last;
    return month;
  }

  function recomputeAndRender() {
    if (!aligned) return;
    const { months, inflationPct, usdtry } = aligned;
    if (months.length === 0) return;
    const S0 = getSalaryNumeric();
    if (!Number.isFinite(S0) || S0 <= 0) { showWarning('Please enter a positive Monthly Salary (TRY).'); return; }

    const startMonth = els.startMonth.value;
    if (!isValidMonthStr(startMonth)) { showWarning('Please select a valid Start Month of Last Raise.'); return; }
    if (startMonth !== months[0]) {
      // Ensure baseline index 0 matches the chosen start, by trimming/aligning to start
      const idx = months.indexOf(startMonth);
      if (idx === -1) { showWarning('Start Month must be within the data range.'); return; }
      // shift baseline by slicing arrays
      aligned = {
        months: months.slice(idx),
        inflationPct: inflationPct.slice(idx),
        usdtry: usdtry.slice(idx)
      };
      return recomputeAndRender();
    }

    const whatIfMonth = clampWhatIfMonth(els.whatIfMonth.value || months[months.length - 1]);
    const whatIfPct = Math.max(0, Math.min(200, Number(els.whatIfPct.value)));
    const whatIfMonthIndex = Math.max(0, aligned.months.indexOf(whatIfMonth));

    const series = computeSeries({ months: aligned.months, inflationPct: aligned.inflationPct, usdtry: aligned.usdtry, S0, whatIfPct, whatIfMonthIndex });

    // Build table rows
    const rows = aligned.months.map((m, i) => {
      const infRaw = aligned.inflationPct[i];
      const infDisplay = Math.max(-50, Math.min(50, infRaw));
      return {
        month: m,
        inflationPctRaw: infRaw,
        inflationPct: infDisplay,
        cpi: series.CPI[i],
        cumInf: series.cumInf[i],
        nominal: series.S_actual[i],
        required: series.S_req[i],
        gapPct: series.gapPct[i],
        real: series.S_real[i],
        usdtry: aligned.usdtry[i],
        usd: series.S_usd[i],
      };
    });

    const metrics = {
      cumInfLatest: series.cumInf[series.cumInf.length - 1],
      requiredRaiseTodayPct: series.requiredRaiseTodayPct,
      usdSalaryLatest: series.S_usd[series.S_usd.length - 1],
      purchPowerVsBasePct: (series.S_actual[series.S_actual.length - 1] / series.S_req[series.S_req.length - 1]) - 1
    };

    clearWarnings();
    renderSummaryCards(metrics);
    renderTable(rows);
    renderCharts(aligned.months, series);

    // Persist
    persistState();
  }

  // Debounce
  function debounce(fn, ms) { let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); }; }
  const debouncedUpdate = debounce(recomputeAndRender, 250);

  // Local storage
  const STORAGE_KEY = 'salarylens-state-v1';
  const THEME_KEY = 'salarylens-theme';
  const INFLSRC_KEY = 'salarylens-infl-source';
  function persistState() {
    try {
      const obj = {
        salary: els.salary.value,
        startMonth: els.startMonth.value,
        whatIfMonth: els.whatIfMonth.value,
        whatIfPct: els.whatIfPct.value
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
    } catch { }
  }
  function persistTheme() {
    try { localStorage.setItem(THEME_KEY, currentTheme); } catch { }
  }
  function persistInflationSource(key) {
    try { localStorage.setItem(INFLSRC_KEY, key); } catch { }
  }
  function restoreState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const state = JSON.parse(raw);
      if (state.salary) els.salary.value = state.salary;
      if (state.startMonth) els.startMonth.value = state.startMonth;
      if (state.whatIfMonth) els.whatIfMonth.value = state.whatIfMonth;
      if (state.whatIfPct) els.whatIfPct.value = state.whatIfPct;
    } catch { }
  }
  function restoreTheme() {
    try {
      const saved = localStorage.getItem(THEME_KEY);
      if (saved === 'dark' || saved === 'light') { setTheme(saved); }
      else { setTheme('light'); }
    } catch { setTheme('light'); }
  }
  function restoreInflationSource() {
    try {
      const saved = localStorage.getItem(INFLSRC_KEY);
      const radioTUIK = document.getElementById('inflSrcTUIK');
      const radioENAG = document.getElementById('inflSrcENAG');
      const radioAVG = document.getElementById('inflSrcAVG');
      if (saved === 'TUIK' && radioTUIK) { radioTUIK.checked = true; }
      else if (saved === 'ENAG' && radioENAG) { radioENAG.checked = true; }
      else if (saved === 'AVG' && radioAVG) { radioAVG.checked = true; }
    } catch { }
  }

  function setTheme(theme) {
    currentTheme = theme === 'dark' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', currentTheme === 'dark' ? 'dark' : '');
    els.themeToggle && (els.themeToggle.textContent = currentTheme === 'dark' ? '🌞 Light' : '🌙 Dark');
    persistTheme();
    // If charts exist, re-render to adjust grid colors
    if (aligned) { recomputeAndRender(); }
  }

  // Event wiring
  async function onValidate() {
    try {
      // Prefer file if provided, else textarea
      let inflText = els.inflationText.value;
      let usdText = els.usdtryText.value;
      if (els.inflationFile.files && els.inflationFile.files[0]) inflText = await readFileAsText(els.inflationFile.files[0]);
      if (els.usdtryFile.files && els.usdtryFile.files[0]) usdText = await readFileAsText(els.usdtryFile.files[0]);
      inflationSets = parseInflationCollections(inflText);
      // Determine active source
      const radioTUIK = document.getElementById('inflSrcTUIK');
      const radioENAG = document.getElementById('inflSrcENAG');
      const radioAVG = document.getElementById('inflSrcAVG');
      if (inflationSets.TUIK || inflationSets.ENAG || inflationSets.AVG) {
        if (radioAVG && radioAVG.checked && inflationSets.AVG) activeInflationKey = 'AVG';
        else if (radioTUIK && radioTUIK.checked && inflationSets.TUIK) activeInflationKey = 'TUIK';
        else if (radioENAG && radioENAG.checked && inflationSets.ENAG) activeInflationKey = 'ENAG';
        else if (inflationSets.TUIK) activeInflationKey = 'TUIK';
        else if (inflationSets.ENAG) activeInflationKey = 'ENAG';
        else if (inflationSets.AVG) activeInflationKey = 'AVG';
      } else {
        activeInflationKey = 'default';
      }
      // persist chosen source (if applicable)
      if (activeInflationKey !== 'default') persistInflationSource(activeInflationKey);
      const infl = inflationSets[activeInflationKey];
      const fx = parseAndValidateUsdTry(usdText);
      const { months, inflationPct, usdtry, warning } = alignByCommonMonths(infl, fx);
      if (months.length === 0) { showWarning('No overlapping months after alignment.'); return; }

      aligned = { months, inflationPct, usdtry };

      // default start month and what-if month
      els.startMonth.value = els.startMonth.value || months[0];
      els.whatIfMonth.value = els.whatIfMonth.value || months[months.length - 1];

      if (warning) showWarning(warning); else clearWarnings();

      recomputeAndRender();
    } catch (e) {
      showWarning(e.message || String(e));
      console.error(e);
    }
  }



  function onExportCsv() {
    if (!aligned) { showWarning('Nothing to export. Validate & Calculate first.'); return; }
    const S0 = getSalaryNumeric();
    if (!Number.isFinite(S0) || S0 <= 0) { showWarning('Please enter a positive Monthly Salary (TRY).'); return; }
    const whatIfMonth = clampWhatIfMonth(els.whatIfMonth.value || aligned.months[aligned.months.length - 1]);
    const whatIfPct = Math.max(0, Math.min(200, Number(els.whatIfPct.value)));
    const whatIfMonthIndex = Math.max(0, aligned.months.indexOf(whatIfMonth));
    const series = computeSeries({ months: aligned.months, inflationPct: aligned.inflationPct, usdtry: aligned.usdtry, S0, whatIfPct, whatIfMonthIndex });
    const rows = aligned.months.map((m, i) => ({
      month: m,
      inflationPct: Math.max(-50, Math.min(50, aligned.inflationPct[i])),
      cpi: series.CPI[i],
      cumInf: series.cumInf[i],
      nominal: series.S_actual[i],
      required: series.S_req[i],
      gapPct: series.gapPct[i],
      real: series.S_real[i],
      usdtry: aligned.usdtry[i],
      usd: series.S_usd[i],
    }));
    const csv = toCsv(rows);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'salarylens.csv'; a.click();
    URL.revokeObjectURL(url);
  }

  // Salary input: assume Turkish locale (thousands '.' and decimal ',')
  function getSalaryNumeric() {
    const raw = els.salary.value;
    if (!raw) return NaN;
    // Remove spaces
    let s = raw.replace(/\s+/g, '');
    // Split on comma for decimal
    const parts = s.split(',');
    if (parts.length > 2) return NaN; // ambiguous
    let intPart = parts[0].replace(/\./g, '').replace(/[^0-9]/g, ''); // strip thousand separators and non-digits
    let fracPart = parts[1] ? parts[1].replace(/[^0-9]/g, '').slice(0, 2) : '';
    if (!intPart) return NaN;
    const numStr = fracPart ? intPart + '.' + fracPart : intPart;
    return Number(numStr);
  }
  function formatSalaryInput() {
    const num = getSalaryNumeric();
    if (!Number.isFinite(num)) return; // leave as-is if invalid
    // Determine entered decimal precision (up to 2)
    const raw = els.salary.value;
    const m = raw.match(/,(\d{1,2})$/);
    const decs = m ? m[1].length : 0;
    const nf = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: decs, maximumFractionDigits: decs });
    els.salary.value = nf.format(num);
  }

  // Live formatting while typing with stable caret (Turkish grouping)
  let _fmtGuard = false;
  function positionOfNthDigit(str, n) {
    if (n <= 0) return 0;
    let count = 0;
    for (let i = 0; i < str.length; i++) {
      if (/\d/.test(str[i])) {
        count++;
        if (count === n) return i + 1; // caret after nth digit
      }
    }
    return str.length;
  }
  function onSalaryInputLive() {
    if (_fmtGuard) return;
    _fmtGuard = true;
    const el = els.salary;
    const raw = String(el.value || '').replace(/\s+/g, '');
    const caret = el.selectionStart ?? raw.length;
    const commaIdx = raw.indexOf(',');
    const inFrac = commaIdx >= 0 && caret > commaIdx;
    const rawIntBeforeCaret = raw.slice(0, Math.min(caret, commaIdx >= 0 ? commaIdx : caret));
    const nDigitsBefore = (rawIntBeforeCaret.match(/\d/g) || []).length;
    // Clean pieces
    const intDigits = (commaIdx >= 0 ? raw.slice(0, commaIdx) : raw).replace(/[^0-9]/g, '');
    const fracDigitsRaw = commaIdx >= 0 ? raw.slice(commaIdx + 1) : '';
    const fracDigits = fracDigitsRaw.replace(/[^0-9]/g, '').slice(0, 2);
    // Format integer part with thousand separators '.'
    const intFormatted = intDigits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    const newVal = intFormatted + (commaIdx >= 0 ? ',' + fracDigits : '');
    // Compute new caret
    let newCaret;
    if (inFrac) {
      const digitsInFracBefore = (raw.slice(commaIdx + 1, caret).match(/\d/g) || []).length;
      const newComma = intFormatted.length;
      newCaret = newComma + 1 + Math.min(digitsInFracBefore, fracDigits.length);
    } else {
      newCaret = positionOfNthDigit(intFormatted, nDigitsBefore);
    }
    el.value = newVal;
    try { el.setSelectionRange(newCaret, newCaret); } catch { }
    _fmtGuard = false;
    debouncedUpdate();
  }
  els.salary.addEventListener('input', onSalaryInputLive);
  els.salary.addEventListener('blur', () => { formatSalaryInput(); debouncedUpdate(); });
  els.whatIfPct.addEventListener('input', debouncedUpdate);
  els.whatIfMonth.addEventListener('input', debouncedUpdate);
  els.startMonth.addEventListener('input', debouncedUpdate);

  els.validateBtn.addEventListener('click', onValidate);
  els.exportCsvBtn.addEventListener('click', onExportCsv);
  els.themeToggle && els.themeToggle.addEventListener('click', () => setTheme(currentTheme === 'dark' ? 'light' : 'dark'));
  // If a file is selected, clear the related textarea to avoid ambiguity
  els.inflationFile.addEventListener('change', () => {
    if (els.inflationFile.files && els.inflationFile.files.length > 0) {
      els.inflationText.value = '';
      persistState();
    }
  });
  els.usdtryFile.addEventListener('change', () => {
    if (els.usdtryFile.files && els.usdtryFile.files.length > 0) {
      els.usdtryText.value = '';
      persistState();
    }
  });
  // Inflation source change triggers re-alignment if already parsed
  ['inflSrcTUIK', 'inflSrcENAG', 'inflSrcAVG'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('change', () => {
        if (!inflationSets) return; // not yet parsed
        if (el.checked) {
          activeInflationKey = id === 'inflSrcTUIK' ? 'TUIK' : id === 'inflSrcENAG' ? 'ENAG' : 'AVG';
          persistInflationSource(activeInflationKey);
          const infl = inflationSets[activeInflationKey];
          if (!infl) return;
          if (aligned) {
            // Re-align months with current FX set (need to re-parse USD from textarea to ensure in sync)
            try {
              let usdText = els.usdtryText.value;
              if (els.usdtryFile.files && els.usdtryFile.files[0]) {
                // re-read file (fresh) in case changed
                const f = els.usdtryFile.files[0];
                const fr = new FileReader();
                fr.onload = () => {
                  const fx = parseAndValidateUsdTry(String(fr.result || ''));
                  const { months, inflationPct, usdtry, warning } = alignByCommonMonths(infl, fx);
                  if (months.length === 0) { showWarning('No overlapping months after alignment.'); return; }
                  aligned = { months, inflationPct, usdtry };
                  if (warning) showWarning(warning); else clearWarnings();
                  recomputeAndRender();
                };
                fr.readAsText(f);
              } else {
                const fx = parseAndValidateUsdTry(usdText);
                const { months, inflationPct, usdtry, warning } = alignByCommonMonths(infl, fx);
                if (months.length === 0) { showWarning('No overlapping months after alignment.'); return; }
                aligned = { months, inflationPct, usdtry };
                if (warning) showWarning(warning); else clearWarnings();
                recomputeAndRender();
              }
            } catch (e) { showWarning(e.message || String(e)); }
          }
        }
      });
    }
  });

  // Parse URL parameters
  function getUrlParams() {
    const params = new URLSearchParams(window.location.search);
    return {
      salary: params.get('salary'),
      startMonth: params.get('startMonth'),
      whatIfMonth: params.get('whatIfMonth'),
      whatIfPct: params.get('whatIfPct'),
      source: params.get('source')
    };
  }

  // Restore last state and optionally auto-load samples for convenience
  restoreState();

  // Check URL parameters (they override localStorage)
  const urlParams = getUrlParams();
  let shouldAutoValidate = false;

  if (urlParams.salary) {
    // URL param takes priority
    const salaryNum = Number(urlParams.salary.replace(/[^0-9.]/g, ''));
    if (Number.isFinite(salaryNum) && salaryNum > 0) {
      els.salary.value = salaryNum.toString();
      formatSalaryInput();
      shouldAutoValidate = true;
    }
  }
  if (urlParams.startMonth && isValidMonthStr(urlParams.startMonth)) {
    els.startMonth.value = urlParams.startMonth;
  }
  if (urlParams.whatIfMonth && isValidMonthStr(urlParams.whatIfMonth)) {
    els.whatIfMonth.value = urlParams.whatIfMonth;
  }
  if (urlParams.whatIfPct) {
    const pct = Number(urlParams.whatIfPct);
    if (Number.isFinite(pct)) {
      els.whatIfPct.value = Math.max(0, Math.min(200, pct));
    }
  }

  // Set default months if not previously saved
  if (!els.startMonth.value) els.startMonth.value = '2025-01';
  if (!els.whatIfMonth.value) els.whatIfMonth.value = '2026-01';

  // Format any restored salary value
  if (els.salary.value && !urlParams.salary) { try { formatSalaryInput(); } catch { } }

  restoreInflationSource();

  // Apply source from URL parameter (overrides localStorage)
  if (urlParams.source) {
    // Use locale-insensitive comparison to avoid Turkish I problem (i -> İ instead of I)
    const source = urlParams.source.toLowerCase();
    const radioTUIK = document.getElementById('inflSrcTUIK');
    const radioENAG = document.getElementById('inflSrcENAG');
    const radioAVG = document.getElementById('inflSrcAVG');

    if (source === 'tuik' && radioTUIK) {
      radioTUIK.checked = true;
    } else if (source === 'enag' && radioENAG) {
      radioENAG.checked = true;
    } else if (source === 'avg' && radioAVG) {
      radioAVG.checked = true;
    }
  }


  // If inputs are empty, pre-populate from bundled data files (pretty-printed)
  (async function prepopulateFromData() {
    try {
      const needInfl = !els.inflationText.value.trim();
      const needUsd = !els.usdtryText.value.trim();
      if (!needInfl && !needUsd) return;
      const tasks = [];
      if (needInfl) tasks.push(fetch('./data/inflation.json').then(r => r.json()).then(j => { els.inflationText.value = JSON.stringify(j, null, 2); }));
      if (needUsd) tasks.push(fetch('./data/usdtry.json').then(r => r.json()).then(j => { els.usdtryText.value = JSON.stringify(j, null, 2); }));
      await Promise.all(tasks);

      // Auto-validate if URL params provided salary
      if (shouldAutoValidate) {
        await onValidate();
      } else if (!els.salary.value) {
        // No salary from URL or localStorage - focus and hint
        els.salary.focus();
        els.salary.placeholder = 'Enter your monthly salary (e.g., 100.000)';
      }
    } catch (e) { console.warn('Prepopulate from data failed:', e); }
  })();

  restoreTheme();

  // Internal tiny tests (dev only)
  try {
    if ((typeof process !== 'undefined' && process.env && process.env.NODE_ENV === 'development') || location.search.includes('dev=1')) {
      // CPI chaining test
      const months = ['2024-01', '2024-02', '2024-03'];
      const inflationPct = [0, 10, 10];
      const usdtry = [30, 30, 30];
      const s = computeSeries({ months, inflationPct, usdtry, S0: 100, whatIfPct: 0, whatIfMonthIndex: 0 });
      console.assert(Math.abs(s.CPI[0] - 100) < 1e-9, 'CPI baseline');
      console.assert(Math.abs(s.CPI[1] - 110) < 1e-9, 'CPI month 1');
      console.assert(Math.abs(s.CPI[2] - 121) < 1e-9, 'CPI month 2');
      // Required raise math
      const rr = s.requiredRaiseTodayPct; // (S_req[L]/S_actual[L])-1, here equals cum inf
      console.assert(Math.abs(rr - (s.cumInf[s.cumInf.length - 1])) < 1e-12, 'requiredRaiseTodayPct matches cumInf');
    }
  } catch (e) { console.error('Internal tests failed:', e); }

})();
