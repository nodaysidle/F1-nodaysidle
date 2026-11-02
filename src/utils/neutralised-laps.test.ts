import { describe, expect, it } from 'vitest';
import type { RaceControlMessage } from '../types/openf1';
import { neutralisedLapNumbers } from './neutralised-laps';

function rc(lap: number | null, message: string, minute: number, category = 'SafetyCar'): RaceControlMessage {
  return {
    session_key: 1,
    meeting_key: 1,
    date: `2026-01-01T12:${String(minute).padStart(2, '0')}:00+00:00`,
    category,
    flag: null,
    lap_number: lap,
    driver_number: null,
    message,
    scope: null,
    sector: null,
    qualifying_phase: null,
  };
}

describe('neutralisedLapNumbers', () => {
  it('marks laps from deployment to ending, both inclusive', () => {
    const messages = [rc(17, 'VIRTUAL SAFETY CAR DEPLOYED', 1), rc(18, 'VIRTUAL SAFETY CAR ENDING', 2)];
    expect([...neutralisedLapNumbers(messages, 57)].sort((a, b) => a - b)).toEqual([17, 18]);
  });

  it('treats a full safety car ending as closing the period', () => {
    const messages = [rc(20, 'SAFETY CAR DEPLOYED', 1), rc(23, 'SAFETY CAR IN THIS LAP', 2)];
    expect([...neutralisedLapNumbers(messages, 57)].sort((a, b) => a - b)).toEqual([20, 21, 22, 23]);
  });

  it('closes an unfinished period at the final lap', () => {
    const messages = [rc(50, 'SAFETY CAR DEPLOYED', 1)];
    expect([...neutralisedLapNumbers(messages, 53)].sort((a, b) => a - b)).toEqual([50, 51, 52, 53]);
  });

  it('handles two separate periods', () => {
    const messages = [
      rc(5, 'VIRTUAL SAFETY CAR DEPLOYED', 1),
      rc(6, 'VIRTUAL SAFETY CAR ENDING', 2),
      rc(30, 'SAFETY CAR DEPLOYED', 3),
      rc(32, 'SAFETY CAR IN THIS LAP', 4),
    ];
    expect([...neutralisedLapNumbers(messages, 57)].sort((a, b) => a - b)).toEqual([5, 6, 30, 31, 32]);
  });

  it('orders events by time, not by array position', () => {
    const messages = [rc(18, 'VIRTUAL SAFETY CAR ENDING', 2), rc(17, 'VIRTUAL SAFETY CAR DEPLOYED', 1)];
    expect([...neutralisedLapNumbers(messages, 57)].sort((a, b) => a - b)).toEqual([17, 18]);
  });

  it('recognises the short VSC wording used in 2026', () => {
    const messages = [rc(7, 'VSC DEPLOYED', 1), rc(8, 'VSC ENDING', 2)];
    expect([...neutralisedLapNumbers(messages, 71)].sort((a, b) => a - b)).toEqual([7, 8]);
  });

  it('closes an open period before a new deployment, when its ending is missing', () => {
    const messages = [rc(44, 'SAFETY CAR DEPLOYED', 1), rc(59, 'SAFETY CAR DEPLOYED', 2), rc(62, 'SAFETY CAR IN THIS LAP', 3)];
    expect([...neutralisedLapNumbers(messages, 71)].sort((a, b) => a - b)).toEqual(
      Array.from({ length: 19 }, (_, i) => i + 44),
    );
  });

  it('does not match lights messages as a deployment', () => {
    const messages = [rc(46, 'SAFETY CAR LIGHTS ON', 1), rc(47, 'SAFETY CAR LIGHTS OFF', 2)];
    expect(neutralisedLapNumbers(messages, 71).size).toBe(0);
  });

  it('ignores non-safety-car messages and messages with no lap', () => {
    const messages = [
      rc(10, 'CAR 4 (NOR) TIME DELETED - TRACK LIMITS', 1, 'Other'),
      rc(null, 'VIRTUAL SAFETY CAR DEPLOYED', 2),
    ];
    expect(neutralisedLapNumbers(messages, 57).size).toBe(0);
  });

  it('returns an empty set when there are no safety car messages', () => {
    expect(neutralisedLapNumbers([], 57).size).toBe(0);
  });
});
