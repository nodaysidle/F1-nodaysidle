# TASKS — Tyre Degradation Overlays

Each task ends with its proof. A task is DONE only when its proof is shown.

## T1 — Race catalog (DONE, pending commit)
- [x] Enumerate race sessions 2024–2026 from OpenF1 (`session_name=Race`, `date_start <= 2026-11-02`).
- [x] Fetch laps and stints for each. Proof: `docs/race-catalog-2024-2026.json`, 69 races, 67 with data. 2024: 24/24. 2025: 24/24. 2026: 19/21.
- [x] Two 2026 races with no data (Bahrain, Saudi Arabia; OpenF1 HTTP 404 for laps). Decision: hide them. Hiding not yet implemented (see T4).

## T2 — Degradation logic (`src/utils/degradation.ts`)
- [ ] Pure functions: tyre age per lap, OLS fit per stint. No fuel correction (decision 2026-11-02).
- [ ] Unit tests with a known slope; pit-lap and SC/VSC exclusion; "insufficient data" under 5 laps.
- Proof: `npm test` output.

## T3 — Safety car and VSC flags
- [ ] Confirm which OpenF1 field marks SC and VSC laps in `/race_control` (`category`, `message`).
- [ ] Add a lap-level flag using that field.
- Proof: a sample session where the flagged laps match the race control messages.

## T4 — Data loading
- [ ] Load laps and stints per race through the existing `OpenF1Client` (cache and queue unchanged).
- [ ] Season picker hides races whose `has_data` is false in `docs/race-catalog-2024-2026.json`.
- [ ] Add a loader hook for the degradation overlay.
- Proof: `npm run test:live` against one 2024, one 2025 and one 2026 race.

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
