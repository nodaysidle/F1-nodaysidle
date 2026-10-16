import type { AlignedComparison, RawLapTelemetry } from '../types/telemetry';
import type { AlignRequest, WorkerResponse } from './protocol';

interface Pending {
  resolve: (value: AlignedComparison) => void;
  reject: (reason: Error) => void;
}

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, Pending>();

function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL('./telemetry.worker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
    const message = event.data;
    const entry = pending.get(message.id);
    if (!entry) return;
    pending.delete(message.id);
    if (message.ok) entry.resolve(message.result);
    else entry.reject(new Error(message.error));
  };
  worker.onerror = (event) => {
    const error = new Error(event.message || 'Telemetry worker crashed');
    for (const entry of pending.values()) entry.reject(error);
    pending.clear();
    worker?.terminate();
    worker = null;
  };
  return worker;
}

/** Runs lap cleaning, distance integration, grid alignment and delta computation off the main thread. */
export function alignInWorker(laps: (RawLapTelemetry | null)[]): Promise<AlignedComparison> {
  const id = nextId++;
  const request: AlignRequest = { id, type: 'align', laps };
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    getWorker().postMessage(request);
  });
}
