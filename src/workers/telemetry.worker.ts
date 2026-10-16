import { alignLaps, processLap, transferablesOf } from './align';
import type { AlignRequest, WorkerResponse } from './protocol';

interface WorkerScope {
  onmessage: ((event: MessageEvent<AlignRequest>) => void) | null;
  postMessage(message: WorkerResponse, transfer: Transferable[]): void;
}

const scope = self as unknown as WorkerScope;

scope.onmessage = (event) => {
  const { id, laps } = event.data;
  const started = performance.now();
  try {
    const result = alignLaps(laps.map((raw) => (raw ? processLap(raw) : null)));
    scope.postMessage({ id, ok: true, result, computeMs: performance.now() - started }, transferablesOf(result));
  } catch (error) {
    scope.postMessage({ id, ok: false, error: error instanceof Error ? error.message : String(error) }, []);
  }
};
