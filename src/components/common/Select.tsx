interface SelectProps<V extends string | number> {
  label: string;
  value: V | null;
  options: { value: V; label: string; disabled?: boolean }[];
  onChange: (value: V) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

/**
 * Native select for keyboard/a11y behaviour; values are round-tripped through their string
 * form and mapped back to the typed option.
 */
export function Select<V extends string | number>({
  label,
  value,
  options,
  onChange,
  placeholder = 'Select…',
  disabled,
  className = '',
}: SelectProps<V>) {
  return (
    <label className={`flex min-w-0 flex-col gap-1 ${className}`}>
      <span className="text-[10px] font-medium tracking-[0.12em] text-ink-faint uppercase">{label}</span>
      <select
        className="field h-8 w-full min-w-0 rounded-md border border-line bg-carbon-2 pr-6 pl-2 text-[13px] text-ink outline-none focus-visible:border-cyan disabled:opacity-40"
        value={value === null ? '' : String(value)}
        disabled={disabled}
        onChange={(event) => {
          const option = options.find((o) => String(o.value) === event.target.value);
          if (option) onChange(option.value);
        }}
      >
        {value === null && <option value="">{placeholder}</option>}
        {options.map((option) => (
          <option key={String(option.value)} value={String(option.value)} disabled={option.disabled}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
