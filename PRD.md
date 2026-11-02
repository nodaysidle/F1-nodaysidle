# PRD — Tyre Degradation Overlays

Status: approved for milestone 1 (decisions 2026-11-02: no fuel correction; hide races without data). Owner: Alan Pfeiffer. Date: 2026-11-02.

## Problem
Lap times are shown per driver, but the tyre effect (how much slower a set of tyres gets with age) is not visible. Comparing compounds means reading stints by hand.

## Goal
For any race in the catalog, show each stint's tyre degradation as a fitted line over its lap times, with the slope in seconds per lap as a label. Everything must come from real OpenF1 data.

## Scope
- Races: every race session in `docs/race-catalog-2024-2026.json` where `has_data` is true (67 of 69 as of 2026-11-02). Sprints are excluded. Races with `has_data` false are hidden from the picker, not shown as disabled.
- Data: OpenF1 `/laps` and `/stints` for the session, plus `/race_control` to flag safety-car and VSC laps.
- Output: overlay on the existing lap-time chart, one line per stint, coloured with `COMPOUND_COLORS`; slope badge per stint.

## Non-goals
- No predictive model, no pit-strategy recommendation.
- No synthetic or placeholder data. Races with no OpenF1 data are shown as unavailable, not filled in.
- No changes to the telemetry scrubbing or replay code.

## Method
1. Build per-lap tyre age: `tyre_age_at_start + (lap_number - lap_start)`.
2. Keep laps that are timed, not in/out laps, and not under safety car or VSC.
3. No fuel correction. Known limitation: cars still burn fuel during a race (refuelling is banned, but the fuel load still falls), so the fitted slope includes a fuel component. The UI must say this.
4. Fit an ordinary least-squares line per stint: `lap_time = intercept + slope * tyre_age`. Report slope (s/lap), intercept, R², and the number of laps used.
5. Stints with fewer than 5 usable laps are reported as "insufficient data", not fitted.

## Acceptance
- Unit tests on synthetic inputs with a known slope, including pit-lap and safety-car exclusion.
- Races with `has_data` false do not appear in the picker.
- Live check: the pipeline runs on at least one race from each of 2024, 2025 and 2026 and the output is recorded.
- `npm test` passes. `npm run build` and `npm run lint` pass.
- Screenshot of the overlay on a real race.
