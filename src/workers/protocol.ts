import type { AlignedComparison, RawLapTelemetry } from '../types/telemetry';

export interface AlignRequest {
  id: number;
  type: 'align';
  laps: (RawLapTelemetry | null)[];
}

export type WorkerResponse =
  | { id: number; ok: true; result: AlignedComparison; computeMs: number }
  | { id: number; ok: false; error: string };
