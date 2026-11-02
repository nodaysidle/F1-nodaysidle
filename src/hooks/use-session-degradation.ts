import { openf1 } from '../api/openf1';
import type { Session } from '../types/openf1';
import { fitSessionDegradation, type SessionStintDegradation } from '../utils/degradation';
import { useAsync, type AsyncState } from './use-async';

export function useSessionDegradation(session: Session | null): AsyncState<SessionStintDegradation[]> {
  return useAsync(
    session === null
      ? null
      : async () => {
          const [laps, stints, messages] = await Promise.all([
            openf1.laps(session),
            openf1.stints(session),
            openf1.raceControl(session),
          ]);
          return fitSessionDegradation(laps, stints, messages);
        },
    [session?.session_key ?? null],
  );
}
