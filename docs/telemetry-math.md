# Telemetry math

Implementation: `src/utils/distance.ts`, `src/utils/delta.ts`, `src/utils/lift-coast.ts`, `src/workers/align.ts`.

## 1. Lap window and clock

Each lap is fetched over `[date_start − 1.5 s, date_start + lap_duration + 1.5 s]`.
Samples are de-duplicated by timestamp and put on a clock `t = (date − date_start) / 1000` seconds.
The arrays are then resampled onto `{0, all samples strictly inside (0, T), T}` where `T = lap_duration`,
so every lap starts at exactly 0 s and ends at exactly its official time.

## 2. Distance (trapezoidal integration)

$$d_i = d_{i-1} + \tfrac12\,(v_{i-1} + v_i)\,\frac{t_i - t_{i-1}}{3.6}$$

with `v` in km/h and `d` in metres. Integration runs over the padded window and `d(0)` is subtracted.
On real data (2024 Spa qualifying, VER L17) this gives 6957 m against the official 7004 m (−0.7 %).

## 3. Shared distance grid

The first non-empty slot is the reference. Its integrated length `L` defines a grid
`0, 5, 10, …, L` (5 m spacing; the last point is exactly `L`).

Every other lap is stretched by `L / L_i` before resampling, so corners line up even though
integrated lengths differ by tens of metres between cars. Channels are interpolated onto the grid:
linear for speed, throttle, brake, rpm, time, x, y; sample-and-hold for gear and DRS.

## 4. Delta

$$\Delta t(d) = t_{comp}(d) - t_{ref}(d)$$

Positive means the comparison car is behind. At `d = L`, Δt equals the official lap-time difference exactly
(both clocks end at their `lap_duration`).

### Micro-sectors on the map

The grid is split into 100 m micro-sectors. For each, the time gained inside it is
`g = Δt(end) − Δt(start)`:

- `g < −0.02 s` → green (comparison faster than reference there)
- `g > +0.02 s` → red (slower)
- otherwise → grey

## 5. Lift & Coast

$$\text{L\&C} = (\text{throttle} = 0) \land (\text{brake} = 0) \land (v > 150\ \text{km/h}) \land (\Delta t \ge 150\ \text{ms})$$

Evaluated per sample on each lap's own clock. A run of qualifying samples spans from the midpoint with
the preceding sample to the midpoint with the following one, because at ~3.7 Hz a single sample stands
for ~270 ms of driving. Zone boundaries are converted to grid distance with the same `L / L_i` stretch.

## 6. Replay interpolation

Location for all cars is loaded in 240 s windows. At clock time `T`, each car's `(x, y)` is linearly
interpolated between the bracketing samples; across a window boundary the last sample of the previous
window is used as the left bracket. Cars with no sample for 20 s are hidden (retired).
