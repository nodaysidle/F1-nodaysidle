import { COMPOUND_COLORS } from '../../utils/colors';

export function CompoundBadge({ compound }: { compound: string | null }) {
  if (!compound) return <span className="text-[11px] text-ink-faint">—</span>;
  const color = COMPOUND_COLORS[compound] ?? '#9A9EAB';
  return (
    <span
      title={compound}
      className="inline-flex size-5 shrink-0 items-center justify-center rounded-full border-2 font-mono text-[9px] font-bold"
      style={{ borderColor: color, color }}
    >
      {compound[0]}
    </span>
  );
}
