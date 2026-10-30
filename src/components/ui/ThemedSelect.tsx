import React, { useState, useRef, useEffect } from 'react';
import { Check, ChevronDown } from 'lucide-react';

// A dropdown that actually looks like Locora, instead of the browser's
// plain native select: parchment-white trigger, Deep Forest focus ring,
// forest-tinted selected row. Native <option> lists are OS-rendered and
// cannot be themed, so this renders its own list. Used everywhere a
// <select> used to sit: Discover filters, LocationPicker, Create/Edit
// category.

export interface ThemedSelectOption {
  value: string;
  label: string;
}

interface ThemedSelectProps {
  value: string;
  options: ThemedSelectOption[];
  onChange: (value: string) => void;
  ariaLabel: string;
  disabled?: boolean;
  // 'bar': compact filter-bar trigger. 'form': full-width form field.
  // 'drawer': full-width, taller, for the mobile filter drawer.
  size?: 'bar' | 'form' | 'drawer';
}

export function ThemedSelect({
  value,
  options,
  onChange,
  ariaLabel,
  disabled,
  size = 'form',
}: ThemedSelectProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open ]);

  const selected = options.find((o) => o.value === value);
  const label = selected ? selected.label : value;

  const triggerSize =
    size === 'bar'
      ? 'px-3 py-2.5 text-xs shrink-0'
      : size === 'drawer'
        ? 'w-full px-3 py-3 text-sm'
        : 'w-full px-3 py-2.5 text-xs';
  const popoverSize =
    size === 'bar'
      ? 'left-0 min-w-full w-max max-w-[calc(100vw-2rem)]'
      : 'left-0 right-0';

  return (
    <div ref={wrapRef} className={`relative ${size === 'bar' ? '' : 'w-full'}`}>
      <button
        type="button"
        aria-label={ariaLabel}
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={`inline-flex items-center justify-between gap-2 rounded-xl border bg-white text-[#1E2320] font-medium shadow-2xs transition-colors cursor-pointer ${triggerSize} ${
          open
            ? 'border-[#1E3F35] ring-1 ring-[#1E3F35]'
            : 'border-[#E2DFD8] hover:border-[#1E3F35]/50'
        } disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-[#E2DFD8]`}
      >
        <span className="truncate">{label}</span>
        <ChevronDown
          className={`w-3.5 h-3.5 shrink-0 text-[#5F635D] transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && !disabled && (
        <div
          className={`absolute z-30 mt-2 bg-white border border-[#E7E3DB] rounded-xl shadow-lg py-1 max-h-64 overflow-y-auto ${popoverSize}`}
        >
          {options.map((opt) => {
            const isSelected = opt.value === value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  onChange(opt.value);
                  setOpen(false);
                }}
                className={`w-full flex items-center justify-between gap-2 text-left px-3 py-2 transition-colors cursor-pointer ${
                  size === 'drawer' ? 'text-sm' : 'text-xs'
                } ${
                  isSelected
                    ? 'bg-[#EAF1ED] text-[#1E3F35] font-semibold'
                    : 'text-[#1E2320] hover:bg-[#F4F1EA]'
                }`}
              >
                <span className="truncate">{opt.label}</span>
                {isSelected && <Check className="w-3.5 h-3.5 shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
