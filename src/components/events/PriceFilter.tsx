import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';
import { EventFilterOptions } from '../../types';

// Price filter as two real checkboxes (Free / Paid) inside the same
// themed dropdown shell as the other filters. The checkboxes ARE the
// state, so they never snap: checking a second box just means "both",
// and unchecking one leaves the other.
//
// Pair -> filter mapping: neither checked = all, Free only = free,
// Paid only = paid, both checked = all. The backend still receives the
// same 'all' | 'free' | 'paid' value, so no service or API change.
//
// The pair resyncs only when the filter changes from OUTSIDE this
// component (Reset all filters, a shared URL), tracked via lastEmitted
// — otherwise the resync would fight the user's own clicks.

import { pairFor, priceTypeFor, PriceType } from '../../utils/price-filter';

interface PriceFilterProps {
  priceType: EventFilterOptions['priceType'];
  onChange: (priceType: PriceType) => void;
  // 'bar': compact filter-bar trigger. 'drawer': full-width, taller,
  // for the mobile filter drawer.
  size?: 'bar' | 'drawer';
}

export function PriceFilter({ priceType, onChange, size = 'bar' }: PriceFilterProps) {
  const current: PriceType = priceType ?? 'all';
  const [open, setOpen] = useState(false);
  const [pair, setPair] = useState(() => pairFor(current));
  const lastEmitted = useRef<PriceType>(current);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Outside change (Reset all filters, shared URL): resync the boxes.
  // The guard keeps this from fighting the user's own toggles, which
  // already set lastEmitted before calling onChange.
  useEffect(() => {
    if (current !== lastEmitted.current) {
      lastEmitted.current = current;
      setPair(pairFor(current));
    }
  }, [current]);

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
  }, [open]);

  const toggle = (which: 'free' | 'paid') => {
    const next = { ...pair, [which]: !pair[which] };
    const nextType = priceTypeFor(next);
    setPair(next);
    lastEmitted.current = nextType;
    onChange(nextType);
  };

  // Exactly one box checked means the list is actually restricted.
  const isActive = pair.free !== pair.paid;
  const label = pair.free && !pair.paid
    ? 'Free'
    : pair.paid && !pair.free
      ? 'Paid'
      : 'All Prices';

  const triggerSize =
    size === 'bar'
      ? 'px-3 py-2.5 text-xs shrink-0'
      : 'w-full px-3 py-3 text-sm';
  const popoverSize =
    size === 'bar'
      ? 'left-0 min-w-full w-max max-w-[calc(100vw-2rem)]'
      : 'left-0 right-0';

  return (
    <div ref={wrapRef} className={`relative ${size === 'bar' ? '' : 'w-full'}`}>
      <button
        type="button"
        aria-label="Filter by price"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={`inline-flex items-center justify-between gap-2 rounded-xl border bg-white text-[#1E2320] font-medium shadow-2xs transition-colors cursor-pointer ${triggerSize} ${
          open
            ? 'border-[#1E3F35] ring-1 ring-[#1E3F35]'
            : isActive
              ? 'border-[#1E3F35]/20 bg-[#EAF1ED] text-[#1E3F35]'
              : 'border-[#E2DFD8] hover:border-[#1E3F35]/50'
        }`}
      >
        <span className="truncate">{label}</span>
        <ChevronDown
          className={`w-3.5 h-3.5 shrink-0 text-[#5F635D] transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div
          className={`absolute z-30 mt-2 bg-white border border-[#E7E3DB] rounded-xl shadow-lg py-1 ${popoverSize}`}
        >
          <label className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-xs text-[#1E2320] hover:bg-[#F4F1EA] transition-colors cursor-pointer">
            <input
              type="checkbox"
              checked={pair.free}
              onChange={() => toggle('free')}
              className="w-4 h-4 accent-[#1E3F35] cursor-pointer shrink-0"
            />
            Free
          </label>
          <label className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-xs text-[#1E2320] hover:bg-[#F4F1EA] transition-colors cursor-pointer">
            <input
              type="checkbox"
              checked={pair.paid}
              onChange={() => toggle('paid')}
              className="w-4 h-4 accent-[#1E3F35] cursor-pointer shrink-0"
            />
            Paid
          </label>
          <div className="flex justify-end px-2 pb-1 pt-1 border-t border-[#EBE7DF] mt-1">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="px-4 py-2 text-xs font-semibold text-white bg-[#1E3F35] hover:bg-[#163028] rounded-lg transition-colors cursor-pointer"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
