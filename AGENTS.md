# F1 Telemetry Pro (F1-nodaysidle) — Agent Specification & Engineering Contract

> **F1-nodaysidle** is a high-performance, client-side Formula 1 telemetry analytics and replay application built with **React 19, Vite, TypeScript, and Tailwind CSS**. It visualizes real FIA telemetry (via OpenF1 API & Jolpica) with sub-frame scrubbing, 4-driver multi-session comparisons, track delta maps, and session replays at 60 FPS.

---

## 1. Opus 5.5 Core Directives

<directives>
- **Native Adaptive Reasoning**: Rely on native Opus 5.5 adaptive reasoning. Do not output meta-commentary, speculative stubs, or placeholder comments.
- **Strictly Real Data**: Never mock or synthesize telemetry. All data must originate from real F1 sessions via the OpenF1 REST API (`https://api.openf1.org/v1/`) with persistent local caching.
- **Performance-First Architecture**: Isolate high-frequency telemetry scrubbing (up to 4 streams at 3.7 Hz interpolated) from React re-renders. Use Canvas / WebGL / uPlot rendering loops, Web Workers for numerical processing, and `requestAnimationFrame`.
- **Definition of Done Enforcement**: Verify that builds pass, type checks succeed with zero `any`, and interactive scrubbing stays locked at 60 FPS before concluding tasks.
</directives>

---

## 2. Core Functional Requirements & Specifications

### 2.1 Real Race Weekend Data Loading
- **Data Source**: OpenF1 API (`https://api.openf1.org/v1`).
  - `/meetings`: Year, country, circuit, meeting_name, meeting_key.
  - `/sessions`: `session_key`, `session_name` (FP1, FP2, FP3, Qualifying, Sprint, Race), `session_type`, `date_start`, `year`.
  - `/drivers`: `driver_number`, `broadcast_name`, `team_name`, `team_colour`, `headshot_url`.
  - `/laps`: `lap_number`, `lap_duration`, `date_start`, `is_pit_out_lap`, `segments_sector_1/2/3`.
  - `/stints`: `compound` (SOFT, MEDIUM, HARD, INTERMEDIATE, WET), `lap_start`, `lap_end`, `tyre_age_at_start`.
  - `/car_data`: Mechanical stream (`speed`, `throttle`, `brake`, `rpm`, `n_gear`, `drs`, `date`).
  - `/location`: Coordinate stream (`x`, `y`, `z`, `date`).
- **Caching & Rate-Limit Strategy**:
  - Implement an IndexedDB caching layer (`idb-keyval` or native `IndexedDB`) keyed by `session_key:driver_number:lap_number`.
  - Fetch telemetry lazily per requested lap or session interval. Never trigger unconstrained queries across an entire session without lap timestamp scoping (`date>=...&date<=...`).

### 2.2 Synchronized Lap Scrubbing & Channels
- **Telemetry Channels**:
  1. **Speed** (km/h)
  2. **Throttle** (0–100%)
  3. **Braking** (0 or 100% / pressure level)
  4. **RPM** (Engine revolutions, 0–15,000)
  5. **Gear Changes** (1–8, Reverse/Neutral)
  6. **DRS Activation** (0/1 binary indicator track)
- **Scrubbing Mechanism**:
  - Distance-based X-axis normalization (0m to lap distance) calculated via cumulative trapezoidal integration of `speed` over `timestamp` intervals.
  - Single master scrubber position (`currentDistance` or `lapProgress` [0..1]) driving synchronized vertical cursor needles across all channel charts, data readout HUDs, and car markers on the circuit map.

### 2.3 Track Map Delta & Time Gain/Loss
- **Track Layout Generation**:
  - Synthesize circuit polyline from reference lap `/location` points (`x`, `y`). Scale and orient to standard SVG viewBox with automatic bounding box normalization.
- **Delta Calculation**:
  - For driver comparisons, interpolate reference driver time $t_{ref}(d)$ and comparison driver time $t_{comp}(d)$ at regular 5-meter distance intervals.
  - Compute $\Delta t(d) = t_{comp}(d) - t_{ref}(d)$.
  - Color track micro-sectors: Green (faster than ref), Red (slower than ref), Gray (neutral $\pm 0.02\text{s}$).

### 2.4 4-Driver Multi-Dimensional Comparison
- Comparison slots: Up to 4 active drivers simultaneously (Slot 1: Reference Driver, Slots 2–4: Comparison Drivers).
- Each slot is independently configurable:
  - **Driver** (e.g., VER vs. NOR vs. HAM vs. LEC)
  - **Lap** (Fastest lap, personal best, specific lap number)
  - **Tyre Compound** (Soft vs. Medium vs. Hard degradation comparison)
  - **Session** (e.g., Qualifying Q3 vs. Race Lap 20)
  - **Year** (Cross-season comparison, e.g., 2023 vs. 2024 at Spa)
- Overlay graphs on shared axes with matching driver/team color coding.

### 2.5 Lift & Coast Visual Indicator
- **Detection Algorithm**:
  $$\text{Lift \& Coast} = (\text{Throttle} == 0) \land (\text{Brake} == 0) \land (\text{Speed} > 150\text{ km/h}) \land (\Delta t \ge 150\text{ms})$$
- **Visualization**:
  - Dedicated amber/cyan highlight band across the telemetry chart time/distance axis.
  - Highlighted circuit track segments displaying energy-saving zones before braking events.

### 2.6 Full Session Replay Engine
- Global session playback with variable clock rate (`0.5x`, `1x`, `2x`, `5x`, `10x`, `20x`).
- Interpolates $(x, y)$ coordinates for all active drivers at time $T$.
- Displays live leaderboard with real-time intervals, gap to leader, current compound, and pit status.

---

## 3. Technical Architecture & Stack

<architecture>
- **Runtime**: Browser-native Single Page App (SPA).
- **Framework**: React 19 + TypeScript + Vite.
- **Styling**: Tailwind CSS + Custom CSS Variables (`#0D0E12` pure dark carbon theme, glassmorphic HUD overlays, F1 team hex palettes).
- **High-Frequency Charting**: `uPlot` or HTML5 2D Canvas (zero DOM per-point overhead; handles 50,000+ data points smoothly).
- **Track Visualizer**: SVG / Canvas with hardware-accelerated 2D transforms and pan/zoom support.
- **State Architecture**:
  - **Static State**: `zustand` for session metadata, selected drivers, active slots, and UI controls.
  - **Transient / Scrubbing State**: Dedicated event emitter / `useRef` animation loop bypassing React component render lifecycles for 60 FPS scrub needles.
- **Compute Offloading**: Web Worker for telemetry alignment, distance integration, and delta interpolation.
- **Data Layer**: Custom OpenF1 client with in-memory LRU cache + IndexedDB persistent store.
</architecture>

---

## 4. Essential Commands

```bash
# Setup
npm install

# Local Development
npm run dev

# Verification & Production Build
npm run lint               # ESLint + TypeScript typecheck (tsc --noEmit)
npm run test               # Unit test suite (Vitest)
npm run build              # Deterministic production bundle validation
```

---

## 5. Definition of Done (DoD)

Before marking any milestone or feature complete:

<definition_of_done>
1. **Real Data Verification**: Telemetry loads from live OpenF1 endpoints; no fallback synthetic arrays.
2. **Synchronized Scrubbing**: Scrubbing a lap updates Speed, Throttle, Brake, RPM, Gear, Track Map marker, and HUD simultaneously without stutter.
3. **Multi-Driver Matrix**: Up to 4 driver slots render simultaneously on charts and track maps with proper color indicators.
4. **Performance Verification**: Telemetry scrubbing maintains 60 FPS on desktop browsers; IndexedDB caches repeated queries.
5. **Clean Compilation**: `npm run build` and `npm run lint` execute with 0 errors and 0 warnings.
</definition_of_done>

---

## 6. Directory Layout & Module Structure

```
F1-nodaysidle/
├── docs/
│   ├── openf1-api-specs.md     # Endpoint contracts and parameters
│   └── telemetry-math.md       # Distance integration & delta formulas
├── src/
│   ├── api/                    # OpenF1 API client, fetchers, and rate-limit queue
│   ├── cache/                  # IndexedDB persistence layer
│   ├── workers/                # Web Worker for lap alignment & math
│   ├── store/                  # Zustand store (session, slots, view state)
│   ├── hooks/                  # Telemetry sync bus, audio cues, resize hooks
│   ├── components/
│   │   ├── common/             # Glassmorphic surfaces, badges, select menus
│   │   ├── session-picker/     # Year/Grand Prix/Session selector
│   │   ├── driver-matrix/      # 4-slot comparison drawer & driver pills
│   │   ├── charts/             # uPlot/Canvas synchronized multi-channel graphs
│   │   ├── track-map/          # Circuit map SVG with delta coloring & car dots
│   │   ├── replay/             # Session replay timeline, clock, play/pause controls
│   │   └── hud/                # Instantaneous telemetry readout gauge cards
│   ├── utils/
│   │   ├── colors.ts           # F1 official team color palette mappings
│   │   ├── distance.ts         # Trapezoidal integration for distance calculation
│   │   └── lift-coast.ts       # Algorithm for detecting fuel/energy saving
│   ├── types/                  # Strict TypeScript contracts for OpenF1 payloads
│   ├── App.tsx
│   └── main.tsx
├── package.json
├── tsconfig.json
└── vite.config.ts
```

---

## 7. Known Gotchas & Anti-Patterns

- **Never** trigger parallel un-timestamped `/car_data` calls for 20 drivers at once; OpenF1 rate-limits high concurrency. Batch or fetch per lap interval (`date >= lap_start && date <= lap_end`).
- **Never** store raw telemetry arrays (thousands of items) directly inside normal React component `useState` if re-rendered during scrubbing; keep raw buffers in stores/refs and pass scrub heads via refs or subscriptions.
- **Never** render SVG `<circle>` or `<path>` nodes for each individual telemetry sample point. Render continuous lines via Canvas2D or uPlot.
- **Brake Data Quirks**: In OpenF1, `brake` is either `0/100` (binary switch) or `0-100` depending on the sensor package. Normalize all brake inputs to a normalized $[0, 1]$ float range.

<!-- trail:start -->
## Trail — repo context graph

This repo is indexed in `.trail/cache/`: small linked markdown nodes that explain each
system and carry exact file:line spans, kept in sync with the code through git.

For ANY task here — understanding how something works, finding where code lives,
or scoping a change — get context from the graph before grepping or opening
source files. Re-ask freely (it's cheap) and reuse literal identifiers you
already have (symbol, error string, file name) as the query. New to this repo?
Run `trail map` first — a token-budgeted orientation (dir clusters, hubs,
hotspots), no LLM, no key.

- Run `trail ask "<your question>" --source` → ranked nodes with the relevant
  code spans inlined (each hit's ≤8-line crux by default; `--full` for whole
  definitions when the crux isn't enough). Match the tool to the task shape:
  for understanding or editing, the top node IS the answer — cite its
  `covers:` file:line spans and edit straight from `--source`. For
  exhaustive tasks ("every occurrence / every caller of this pattern"), ranked
  results are top-N, not complete — run `trail grep "<literal>"` instead
  (exhaustive over indexed files, grouped by enclosing symbol), falling back
  to raw `grep -rn` only for unindexed files.
- `trail skeleton <file>` → every definition's signature + span, ~10× cheaper
  than reading the file; use it to skim an API surface.
- `trail callers <symbol>` gives precomputed, exact edges — who calls this.
  Add `--direction out` for what it calls, or `--depth N` to walk
  transitively for the full blast radius. For structural questions, skip
  ranking and use this directly.
- Or browse: `.trail/cache/INDEX.md` lists every node; follow the links.
- Monorepos and folders of multiple repos rank fairly across sub-projects —
  hits carry `[scope/]` labels naming which one they're from. Narrow with
  `trail ask "<task>" --in <scope>/` once you know where you're working.

If a returned span is truncated ("+N more lines"), open the file at that exact
range before finalizing. Only open source files when a node genuinely lacks a
needed detail, and then at the exact file:line the node points to — never
re-read whole files.

After big code changes, refresh the graph with `trail build` (deterministic,
no API key, $0).
<!-- trail:end -->

<!-- delegation:v1 -->
## Delegation — Sonnet builds, Haiku swarms, Opus reviews

Launch with `claude --model sonnet --advisor opus`. Sonnet 5.5 runs the session, coordinates, writes the code and applies fixes.

- **Delegate every repo search and test run to the Haiku 5.5 subagents** to keep the main context small:
  - `search`: maps the repo (read-only).
  - `grep`: finds call sites and occurrences in its own context.
  - `audit`: checks the diff and runs the tests in a throwaway worktree. The worktree branches from the default branch, so put the `git diff` output in the audit prompt.
- **Consult the Opus advisor only at three moments:** before a plan locks, when the same error shows up twice, and before calling it done (it signs off on the synthesized diff).
- **Micro-forks** (which file, which tool, retry or stop) need no thinker. Decide them directly, without spawning agents or calling the advisor. When app code here needs routing like this at runtime, use TypeSafe Jev (the `typesafe` skill).
