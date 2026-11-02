# TASKS — Tyre Degradation Overlays

Each task ends with its proof. A task is DONE only when its proof is shown.

## T1 — Race catalog (DONE, pending commit)
- [x] Enumerate race sessions 2024–2026 from OpenF1 (`session_name=Race`, `date_start <= 2026-11-02`).
- [x] Fetch laps and stints for each. Proof: `src/data/race-catalog-2024-2026.json`, 69 races, 67 with data. 2024: 24/24. 2025: 24/24. 2026: 19/21.
- [x] Two 2026 races with no data (Bahrain, Saudi Arabia; OpenF1 HTTP 404 for laps). Decision: hide them. Hiding not yet implemented (see T4).

## T2 — Degradation logic (`src/utils/degradation.ts`) (DONE)
- [x] Pure functions: tyre age per lap, OLS fit per stint. No fuel correction (decision 2026-11-02).
- [x] Unit tests with a known slope; pit-lap exclusion; "insufficient data" under 5 laps.
- Proof: `npm test` output.

## T3 — Safety car and VSC flags (DONE)
- [x] Confirmed: `/race_control` `category: "SafetyCar"`, messages `SAFETY CAR DEPLOYED`, `VIRTUAL SAFETY CAR DEPLOYED`, `VSC DEPLOYED`, `... ENDING`, `SAFETY CAR IN THIS LAP`. Lights messages are ignored.
- [x] Lap exclusion in `src/utils/neutralised-laps.ts`. A new deployment closes an open period on the lap before it.
- Proof: unit tests in `neutralised-laps.test.ts`; live run on 2024 Australia (VSC laps 17-18 excluded) and 2026 Mexico (VSC 7-8, SC 44-62).

## T4 — Data loading (DONE for loading and hiding; overlay UI is T5)
- [x] Loads laps, stints and race control through `OpenF1Client` (`raceControl()` added; cache and queue unchanged).
- [x] Season picker hides meetings whose race has `has_data` false (`src/data/race-catalog.ts`, catalog moved to `src/data/`).
- [x] Loader hook `src/hooks/use-session-degradation.ts`.
- Proof: `npm run test:live` (4 tests in `degradation.live.test.ts` plus existing OpenF1 live test). Fits: 2024 Bahrain 62/63 stints, 2025 Bahrain 59/62, 2026 Mexico City 51/80. Hook is not yet rendered (T5).

## T5 — Overlay rendering
- [ ] Draw one fitted line per stint on the lap-time uPlot chart, coloured with `COMPOUND_COLORS`.
- [ ] Show slope (s/lap) and R² on each stint; show the fuel-correction assumption in the legend.
- Proof: screenshot of a real race.

## T6 — Verification gate
- [ ] `npm test`, `npm run build`, `npm run lint` all exit 0.
- [ ] Live check output recorded.
- [ ] Screenshot saved under `docs/screenshots/`.

## Decisions (2026-11-02)
- No fuel correction. Slopes include fuel burn; the UI states this.
- Races without data are hidden, not disabled.
