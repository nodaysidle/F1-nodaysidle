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

## T5 — Overlay rendering (DONE)
- [x] Finding: there is no lap-time chart in the app. The PRD's "existing lap-time chart" does not exist; the existing uPlot chart is per-lap telemetry by distance. Built a new panel instead: `Tyre Degradation`, under the Track Map.
- [x] Plot: tyre age (x) vs lap time (y), a points series per stint coloured by `COMPOUND_COLORS`, and a dashed fitted line per fitted stint. Series builder: `src/components/degradation/degradation-plot.ts` (tested).
- [x] Stint list below the chart: slope (s/lap), R², laps used, or "insufficient data". Footer states that slopes include fuel burn and SC/VSC laps are excluded.
- [x] Race sessions only. Non-race sessions show a message instead.
- Proof: `docs/screenshots/tyre-degradation-2024-bahrain.png` (2024 Bahrain race, VER/LEC/NOR/HAM). Fits in the panel match the live test counts.
- Bug found and fixed during the browser check: a zustand selector built a new array on each render, which looped React forever and left the app blank.

## T6 — Verification gate (DONE)
- [x] `npm run lint` exit 0; `npx vitest run` 83 of 83; `npm run build` exit 0.
- [x] `npx vitest run --config vitest.live.config.ts` 5 of 5 against real OpenF1 data.
- [x] Screenshot saved: `docs/screenshots/tyre-degradation-2024-bahrain.png`.

## Decisions (2026-11-02)
- No fuel correction. Slopes include fuel burn; the UI states this.
- Races without data are hidden, not disabled.
