import { useState } from 'react';
import { openf1 } from '../../api/openf1';
import { useAsync } from '../../hooks/use-async';
import { Select } from '../common/Select';

/** OpenF1 car telemetry starts with the 2023 season. */
const FIRST_YEAR = 2023;

export const SEASONS = Array.from(
  { length: new Date().getUTCFullYear() - FIRST_YEAR + 1 },
  (_, i) => new Date().getUTCFullYear() - i,
);

export interface SessionSelection {
  year: number | null;
  meetingKey: number | null;
  sessionKey: number | null;
}

interface SessionPickerProps extends SessionSelection {
  onChange: (next: SessionSelection) => void;
  /** Restrict to sessions that have finished (replay needs complete data). */
  finishedOnly?: boolean;
  compact?: boolean;
}

export function SessionPicker({ year, meetingKey, sessionKey, onChange, finishedOnly = false, compact = false }: SessionPickerProps) {
  const meetings = useAsync(year === null ? null : () => openf1.meetings(year), [year]);
  const sessions = useAsync(meetingKey === null ? null : () => openf1.sessions(meetingKey), [meetingKey]);
  const [now] = useState(() => Date.now());

  return (
    <div className={compact ? 'grid grid-cols-[72px_1fr] gap-2' : 'grid grid-cols-[84px_minmax(0,1fr)_minmax(0,1fr)] gap-2'}>
      <Select
        label="Season"
        value={year}
        options={SEASONS.map((y) => ({ value: y, label: String(y) }))}
        onChange={(y) => {
          onChange({ year: y, meetingKey: null, sessionKey: null });
        }}
      />
      <Select
        label={meetings.loading ? 'Grand Prix · loading' : 'Grand Prix'}
        value={meetingKey}
        disabled={!meetings.data}
        options={(meetings.data ?? []).map((m) => ({
          value: m.meeting_key,
          label: m.meeting_name,
          disabled: Date.parse(m.date_start) > now,
        }))}
        onChange={(key) => {
          onChange({ year, meetingKey: key, sessionKey: null });
        }}
      />
      <Select
        label={sessions.loading ? 'Session · loading' : 'Session'}
        className={compact ? 'col-span-2' : ''}
        value={sessionKey}
        disabled={!sessions.data}
        options={(sessions.data ?? []).map((s) => ({
          value: s.session_key,
          label: s.session_name,
          disabled: Date.parse(finishedOnly ? s.date_end : s.date_start) > now,
        }))}
        onChange={(key) => {
          onChange({ year, meetingKey, sessionKey: key });
        }}
      />
      {(meetings.error ?? sessions.error) && (
        <p className="col-span-full text-[11px] text-red-400">{meetings.error ?? sessions.error}</p>
      )}
    </div>
  );
}
