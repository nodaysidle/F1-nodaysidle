import type { AlignedSlot } from '../../types/telemetry';

export type ChannelKey = 'speed' | 'throttle' | 'brake' | 'rpm' | 'gear' | 'drs' | 'delta';

export interface ChannelSpec {
  key: ChannelKey;
  label: string;
  unit: string;
  /** Relative share of the stack height. */
  weight: number;
  range: [number, number] | null;
  stepped: boolean;
  /** Maps the stored value to the displayed value. */
  scale: number;
  pick: (slot: AlignedSlot) => Float64Array;
  format: (v: number) => string;
  /** Fixed y-axis tick positions for discrete channels. */
  ticks?: number[];
  tickLabel?: (v: number) => string;
}

export const CHANNELS: ChannelSpec[] = [
  {
    key: 'speed',
    label: 'Speed',
    unit: 'km/h',
    weight: 2.6,
    range: null,
    stepped: false,
    scale: 1,
    pick: (s) => s.speed,
    format: (v) => v.toFixed(0),
  },
  {
    key: 'throttle',
    label: 'Throttle',
    unit: '%',
    weight: 1.3,
    range: [-4, 104],
    stepped: false,
    scale: 1,
    pick: (s) => s.throttle,
    format: (v) => v.toFixed(0),
  },
  {
    key: 'brake',
    label: 'Brake',
    unit: '%',
    weight: 0.9,
    range: [-4, 104],
    stepped: false,
    scale: 100,
    pick: (s) => s.brake,
    format: (v) => v.toFixed(0),
  },
  {
    key: 'rpm',
    label: 'RPM',
    unit: 'rpm',
    weight: 1.3,
    range: [3000, 13500],
    stepped: false,
    scale: 1,
    pick: (s) => s.rpm,
    format: (v) => v.toFixed(0),
  },
  {
    key: 'gear',
    label: 'Gear',
    unit: '',
    weight: 1.1,
    range: [0, 8.6],
    stepped: true,
    scale: 1,
    pick: (s) => s.gear,
    format: (v) => (v <= 0 ? 'N' : v.toFixed(0)),
    ticks: [2, 4, 6, 8],
  },
  {
    key: 'drs',
    label: 'DRS',
    unit: '',
    weight: 0.55,
    range: [-0.15, 1.3],
    stepped: true,
    scale: 1,
    pick: (s) => s.drs,
    format: (v) => (v >= 0.5 ? 'OPEN' : 'CLOSED'),
    ticks: [0, 1],
    tickLabel: (v) => (v === 1 ? 'ON' : 'OFF'),
  },
  {
    key: 'delta',
    label: 'Δ to ref',
    unit: 's',
    weight: 1.6,
    range: null,
    stepped: false,
    scale: 1,
    pick: (s) => s.delta,
    format: (v) => v.toFixed(3),
  },
];

export const AXIS_WIDTH = 52;
