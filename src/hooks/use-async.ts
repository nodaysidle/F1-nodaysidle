import { useEffect, useState } from 'react';

export interface AsyncState<T> {
  data: T | undefined;
  error: string | null;
  loading: boolean;
}

/** Runs `run` whenever `deps` change and discards results from superseded runs. Pass null to skip. */
export function useAsync<T>(run: (() => Promise<T>) | null, deps: readonly unknown[]): AsyncState<T> {
  const [state, setState] = useState<AsyncState<T> & { key: string }>({
    data: undefined,
    error: null,
    loading: false,
    key: '',
  });
  const key = JSON.stringify(deps);

  useEffect(() => {
    if (!run) return;
    let live = true;
    run().then(
      (data) => {
        if (live) setState({ data, error: null, loading: false, key });
      },
      (error: unknown) => {
        if (live) setState({ data: undefined, error: error instanceof Error ? error.message : String(error), loading: false, key });
      },
    );
    return () => {
      live = false;
    };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!run) return { data: undefined, error: null, loading: false };
  if (state.key !== key) return { data: undefined, error: null, loading: true };
  return state;
}
