/** Official team liveries, used when OpenF1 omits `team_colour`. Keys are lower-cased team names. */
export const TEAM_COLORS: Record<string, string> = {
  'red bull racing': '#3671C6',
  ferrari: '#E8002D',
  mercedes: '#27F4D2',
  mclaren: '#FF8000',
  'aston martin': '#229971',
  alpine: '#FF87BC',
  williams: '#64C4FF',
  rb: '#6692FF',
  'racing bulls': '#6692FF',
  alphatauri: '#5E8FAA',
  'kick sauber': '#52E252',
  sauber: '#52E252',
  'alfa romeo': '#C92D4B',
  'haas f1 team': '#B6BABD',
  haas: '#B6BABD',
  cadillac: '#AAAAAD',
  audi: '#F50537',
};

/** Distinct fallbacks per slot when two slots would otherwise share a colour. */
export const SLOT_FALLBACKS = ['#F5F5F7', '#FFB800', '#00E0FF', '#FF4FD8'];

export const LIFT_COAST_COLOR = '#FFB000';
export const LIFT_COAST_ALT = '#22D3EE';
export const DELTA_COLORS = { faster: '#22C55E', slower: '#EF4444', neutral: '#5B5F6B' } as const;

export const COMPOUND_COLORS: Record<string, string> = {
  SOFT: '#FF3333',
  MEDIUM: '#FFD12E',
  HARD: '#F0F0F0',
  INTERMEDIATE: '#43B02A',
  WET: '#0067AD',
};

export function teamColor(teamName: string | null, teamColour: string | null): string {
  if (teamColour && /^[0-9a-f]{6}$/i.test(teamColour)) return `#${teamColour.toUpperCase()}`;
  return TEAM_COLORS[(teamName ?? '').toLowerCase()] ?? '#9CA3AF';
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function colorDistance(a: string, b: string): number {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  return Math.hypot(r1 - r2, g1 - g2, b1 - b2);
}

/**
 * Keeps each slot in its team colour, but swaps in a slot fallback when a colour is
 * visually indistinguishable from an earlier slot's (teammates, same driver across years).
 */
export function assignSlotColors(colors: (string | null)[]): (string | null)[] {
  const taken: string[] = [];
  return colors.map((color, slot) => {
    if (!color) return null;
    const clash = taken.some((c) => colorDistance(c, color) < 60);
    const chosen = clash ? (SLOT_FALLBACKS.find((f) => taken.every((c) => colorDistance(c, f) >= 60)) ?? SLOT_FALLBACKS[slot]) : color;
    taken.push(chosen);
    return chosen;
  });
}

export function withAlpha(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
