# 📊 SalaryLens — See Your Salary Clearly

A tiny Node.js + Express static app to explore how your salary tracks inflation and FX — plus a quick “what‑if” raise simulator. No frameworks; just vanilla HTML/CSS/JS and Chart.js via CDN.

## 🚀 Run locally

```sh
npm i
npm start
# open http://localhost:3000
```

Health check:

```sh
curl http://localhost:3000/healthz
```

For static hosting (e.g., GitHub Pages), a static health file is available at `public/healthz.json` and will be served as `/healthz.json`.

## 🧩 JSON Schemas

Inflation JSON

```json
{
  "series": [
    { "month": "2024-01", "inflationPct": 6.7 },
    { "month": "2024-02", "inflationPct": 4.5 }
  ]
}
```

Rules:
- `month` must be `YYYY-MM`, strictly ascending, no duplicates, no gaps.
- `inflationPct` is MoM percent, decimals allowed, must be within ±50.

USD/TRY JSON

```json
{
  "series": [
    { "month": "2024-01", "usdtry": 29.8 },
    { "month": "2024-02", "usdtry": 30.6 }
  ]
}
```

Rules:
- `month` must be `YYYY-MM`, strictly ascending, no duplicates, no gaps.
- `usdtry` must be > 0.

If the two series cover different ranges, the app automatically intersects them and shows a warning like:

> Using common range: 2024-01 … 2025-11 (X months truncated).

If there is no overlap at all, it will hard‑stop with a clear error.

## 🧮 Calculations

Let index 0 be the baseline (start month). We chain CPI from monthly inflation; baseline is 100. The first month’s MoM is applied immediately so values “add up.”

- CPI chaining: `CPI[0] = 100 * (1 + inf[0]/100)`, and for m ≥ 1: `CPI[m] = CPI[m-1] * (1 + inf[m]/100)`
- Cumulative inflation: `cumInf[m] = CPI[m]/100 - 1`
- Nominal base salary (TRY): `S0`
- Required nominal to preserve purchasing power: `S_req[m] = S0 * (CPI[m]/CPI[0])`
- Actual nominal salary with what-if raise month/pct: `S_actual[m]` equals `S0` before the what-if month, and `S0 * (1 + whatIfPct/100)` starting from that month
- Real salary in base prices: `S_real[m] = S_actual[m] / (CPI[m]/CPI[0])`
- Gap vs required purchasing power: `gapPct[m] = (S_actual[m] / S_req[m]) - 1`
- Required raise today (latest index L): `requiredRaiseTodayPct = (S_req[L] / S_actual[L]) - 1`
- USD salary: `S_usd[m] = S_actual[m] / usdtry[m]`

## 🖥️ UI

- Paste JSON into the textareas or choose JSON files via file inputs.
- Fill salary, choose start month (baseline) and what‑if raise month/percent.
- Click "Validate & Calculate" to parse, validate, align by common months, compute, and render.
- What‑if inputs update the table and charts instantly (250 ms debounce).
- "Export CSV" downloads the current grid.
- Inputs persist locally (localStorage).

### 📑 Table Columns

- Month (YYYY-MM)
- MoM Inflation %
- CPI Index (2 decimals)
- Cumulative Inflation % (2 decimals)
- Nominal Salary (TRY) — after what-if
- Required Salary (TRY)
- Gap vs Required % (2 decimals)
- Real Salary (TRY, base prices)
- USD/TRY
- Salary (USD)

Formatting: TRY in tr-TR (2 decimals), USD in en-US (2 decimals), MoM % with 2 decimals and sign, CPI with 2 decimals.

### 📈 Charts

- Required vs Actual salary (TRY)
- Real salary (TRY, base prices)
- Salary in USD

Shared x‑axis = months. Tooltips enabled. Legend toggles. Responsive.

## ♿ Accessibility

- Proper labels, keyboard focus styles.
- Warnings area uses `aria-live` and a dismiss button.

## 📦 Data

Bundled data files live under `public/data/`:
- `inflation.json` (TUIK/ENAG combined structure)
- `usdtry.json`

On first load (or if inputs are empty), the app pre‑populates both JSON inputs with the pretty‑printed contents of these files. You can still paste your own JSON or upload files to override.

Tip: You can also switch the inflation source between TUIK, ENAG, or an Average of both.

Theme: Toggle light/dark in the header. Your choice is remembered.

The selected inflation source (TUIK / ENAG / AVG) is also remembered between visits.

## ☁️ Deploy

You’ve got two easy options to publish this as a static site:

### Option A — GitHub Actions (auto on push)

This repo includes a workflow at `.github/workflows/deploy.yml` that deploys `public/` to GitHub Pages whenever you push to `main`.

Steps:
- In your repository settings, enable GitHub Pages to use the “GitHub Actions” source.
- Push to `main`. The workflow uploads `public/` and publishes it. The resulting URL is available in the workflow summary (typically `https://<user>.github.io/<repo>/`).

### Option B — Manual via gh-pages branch

Alternatively, you can use the included npm script (via `gh-pages`) to push `public/` to the `gh-pages` branch.

1) Ensure the repo is created and you have push access.
2) Run:

```sh
npm i
npm run deploy:gh-pages
```

3) In repository settings → Pages, select the `gh-pages` branch (root) for the Pages site. Your site will be available shortly.

Notes:
- All asset links are relative (e.g., `./favicon.svg`, `./app.js`), so subpath hosting works out-of-the-box.
- There’s no build step; `public/` is the site root.

## 🧪 Prompt

```text
You are an expert Node.js engineer. Create a minimal app named “SalaryLens” that serves a single static page. No React/Angular/Vue. Use Express only to serve static files.

Tech & Constraints
- Node.js LTS. Express for static hosting of /public only.
- No build step. Plain HTML/CSS/JS.
- Chart.js via CDN for charts (no other UI libs). No external network calls beyond this.

File layout
- /package.json
- /server.js
- /public/index.html
- /public/styles.css
- /public/app.js
- /public/data/inflation.json (TUIK + ENAG combined data)
- /public/data/usdtry.json
- /public/favicon.svg
- /README.md

index.html content
- Title: SalaryLens
- Inputs (responsive row): textareas or file inputs for Inflation JSON and USD/TRY JSON; number input Monthly Salary (TRY); month inputs Start Month of Last Raise and What‑If Raise Month (default latest); number input What‑If Raise % (0–200, step 0.1).
- Radio group to choose inflation source: TUIK, ENAG, Average (TUIK+ENAG)/2.
- Buttons: Validate & Calculate, Reset, Export CSV; theme toggle (light/dark).
- Summary cards: Total Inflation Since Start; Required Raise Today; Current USD Salary; Purchasing Power vs Base.
- Table (sticky header, horizontally scrollable on mobile).
- Three canvases for charts: Required vs Actual salary (TRY), Real salary (TRY base prices), Salary in USD.
- Dismissible warning area with aria‑live.

Data contracts (strict validation)
- Inflation JSON accepts either legacy { series: [...] } or combined { TUIK: {series: [...]}, ENAG: {series: [...] }}.
  series item: { "month": "YYYY-MM", "inflationPct": number }
  Rules: months ascending, sorted, continuous (no gaps), no duplicates; |inflationPct| ≤ 50.
- USD/TRY JSON: { series: [{ "month": "YYYY-MM", "usdtry": number > 0 }] } same month rules.
- Align by intersection range; warn: “Using common range: START … END (X months truncated).” Hard‑stop if no overlap.

Core calculations (in app.js as pure functions)
- Interpret MoM for the labeled month (include first month in chain):
  CPI[0] = 100 * (1 + inf[0]/100); for m≥1: CPI[m] = CPI[m-1] * (1 + inf[m]/100)
- cumInf[m] = CPI[m]/100 − 1
- S_req[m] = S0 * (CPI[m]/100)
- What‑if raise: before what‑if index S_actual = S0; from what‑if index S_actual = S0*(1+whatIfPct/100)
- S_real[m] = S_actual[m] / (CPI[m]/100)
- gapPct[m] = (S_actual[m] / S_req[m]) − 1
- requiredRaiseTodayPct = (S_req[L] / S_actual[L]) − 1
- S_usd[m] = S_actual[m] / usdtry[m]

Table columns & formatting
- Month; MoM Inflation %; CPI Index; Cumulative Inflation %; Nominal Salary (TRY); Required Salary (TRY); Gap vs Required %; Real Salary (TRY); USD/TRY; Salary (USD).
- Formatting: TRY tr‑TR 2dp; USD en‑US 2dp; MoM % 2dp with sign; CPI 2dp; Cumulative % 2dp; Gap % 2dp.
- Cap displayed MoM to ±50% with a warning badge. Sticky header; right‑align numeric columns; use tabular numbers.

Charts (Chart.js)
- Chart A: Required (TRY) vs Actual (TRY)
- Chart B: Real salary (TRY base prices)
- Chart C: Salary (USD)
- Shared x‑axis = months; tooltips on; legend toggles; responsive; grid color adapts to theme.

UX behavior
- Validate & Calculate: parse inputs (prefer file if provided, else textarea), validate strictly, intersect ranges, compute, render. If source radios include TUIK/ENAG and both exist, also synthesize AVG = (TUIK+ENAG)/2 and allow selecting it.
- What‑if inputs update table+charts instantly (debounce 250 ms).
- Export CSV downloads the grid with current what‑if results.
- Persist last inputs in localStorage (including pasted JSONs and theme). If a file is selected, clear the related textarea.
- Accessibility: proper labels, focus, aria‑live warnings.

server.js (Express)
- Serve /public statically on PORT or 3000.
- GET /healthz → { ok: true }.

styles.css
- Light theme by default, data-theme="dark" for dark palette; clean responsive layout (grid/flex); sticky table header; mobile horizontal scroll; tasteful colors; no external CSS frameworks.

app.js functions
- parseInflationCollections(jsonText)
- parseAndValidateUsdTry(jsonText)
- alignByCommonMonths(infl, fx)
- computeSeries({ months, inflationPct[], usdtry[], S0, whatIfPct, whatIfMonthIndex })
- toCsv(rows)
- renderSummaryCards, renderTable, renderCharts, showWarning/clearWarnings
- debounce, localStorage persistence (key salarylens-state-v1), theme persistence.
- Tiny dev assertions for CPI chaining and required raise math.

Data
- Put pretty‑printed samples in /public/data/inflation.json and /public/data/usdtry.json. On first load (if inputs are empty), auto‑fill the textareas from these files.

Deliverables
- Full runnable solution with the exact file layout above, minimal code, and README instructions for npm i / npm start.
```
