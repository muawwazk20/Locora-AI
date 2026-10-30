import React, { useState, useRef, useEffect } from 'react';
import { Calendar, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { EventFilterOptions } from '../../types';
import {
  buildMonthGrid,
  formatDayLong,
  formatRangeLabel,
  monthLabel,
  monthOf,
  toISODate,
} from '../../utils/date-range';

// Replaces the old "Any Date" select on Discover with a real calendar:
// pick a start day, then an end day (same day twice = one day), plus
// quick presets and an "Any dates" button that clears the range.
// The trigger shows the picked range, or the active preset, or Any Date.

interface DateRangePickerProps {
  dateRange: EventFilterOptions['dateRange'];
  startDate?: string;
  endDate?: string;
  onChange: (patch: {
    dateRange: EventFilterOptions['dateRange'];
    startDate: string;
    endDate: string;
  }) => void;
  // 'bar': compact filter-bar trigger. 'drawer': full-width, taller,
  // for the mobile filter drawer.
  size?: 'bar' | 'drawer';
}

const PRESETS: { value: 'today' | 'this_weekend' | 'this_month'; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'this_weekend', label: 'This Weekend' },
  { value: 'this_month', label: 'This Month' },
];

export function DateRangePicker({
  dateRange,
  startDate,
  endDate,
  onChange,
  size = 'bar',
}: DateRangePickerProps) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState(() => {
    if (startDate) return monthOf(startDate);
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });
  const [pickStart, setPickStart] = useState('');
  const [pickEnd, setPickEnd] = useState('');
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
  }, [open]);

  const openPicker = () => {
    // Fresh pick from the current filter each time it opens, so a
    // half-picked range from last time never lingers.
    if (dateRange === 'custom' && startDate && endDate) {
      setPickStart(startDate);
      setPickEnd(endDate);
      setView(monthOf(startDate));
    } else {
      setPickStart('');
      setPickEnd('');
      const now = new Date();
      setView({ year: now.getFullYear(), month: now.getMonth() });
    }
    setOpen(true);
  };

  const triggerLabel =
    dateRange === 'custom' && startDate && endDate
      ? formatRangeLabel(startDate, endDate)
      : dateRange === 'today'
        ? 'Today'
        : dateRange === 'this_weekend'
          ? 'This Weekend'
          : dateRange === 'this_month'
            ? 'This Month'
            : 'Any Date';
  const isActive = dateRange !== 'all' && !!dateRange;

  // Past dates cannot be picked: the string compare works because all
  // dates here are local YYYY-MM-DD.
  const today = toISODate(new Date());

  const shiftMonth = (delta: number) => {
    const d = new Date(view.year, view.month + delta, 1);
    setView({ year: d.getFullYear(), month: d.getMonth() });
  };

  const handleDayClick = (date: string) => {
    if (date < today) return;
    const m = monthOf(date);
    if (m.year !== view.year || m.month !== view.month) setView(m);
    if (!pickStart || pickEnd || date < pickStart) {
      // First click, or restarting after a completed range, or picking
      // an earlier day than the current start: this becomes the start.
      setPickStart(date);
      setPickEnd('');
    } else {
      // Second click at or after the start completes the range (same
      // day twice = a single day). Results update immediately; the
      // popover stays open so the range can be adjusted or cleared.
      setPickEnd(date);
      onChange({ dateRange: 'custom', startDate: pickStart, endDate: date });
    }
  };

  const handlePreset = (preset: 'today' | 'this_weekend' | 'this_month') => {
    onChange({ dateRange: preset, startDate: '', endDate: '' });
    setOpen(false);
  };

  const handleAnyDates = () => {
    onChange({ dateRange: 'all', startDate: '', endDate: '' });
    setOpen(false);
  };

  const days = buildMonthGrid(view.year, view.month);
  const hint = pickStart && pickEnd
    ? `Selected: ${formatRangeLabel(pickStart, pickEnd)}`
    : pickStart
      ? `Start: ${formatDayLong(pickStart)} — now pick an end date`
      : 'Pick a start date, then an end date (same day twice = one day). Past dates can’t be selected.';

  const triggerSize =
    size === 'bar'
      ? 'px-3 py-2.5 text-xs shrink-0'
      : 'w-full px-3 py-3 text-sm';
  const popoverSize =
    size === 'bar'
      ? 'right-0 w-[320px] max-w-[calc(100vw-2rem)]'
      : 'left-0 right-0';

  return (
    <div ref={wrapRef} className={`relative ${size === 'bar' ? '' : 'w-full'}`}>
      <button
        type="button"
        aria-label="Choose a date range"
        aria-expanded={open}
        onClick={() => (open ? setOpen(false) : openPicker())}
        className={`inline-flex items-center gap-1.5 rounded-xl border text-[#1E2320] font-medium shadow-2xs transition-colors cursor-pointer ${triggerSize} ${
          open
            ? 'border-[#1E3F35] ring-1 ring-[#1E3F35] bg-white'
            : isActive
              ? 'border-[#1E3F35]/20 bg-[#EAF1ED] text-[#1E3F35]'
              : 'border-[#E2DFD8] bg-white hover:bg-[#F4F1EA]'
        }`}
      >
        <Calendar className="w-3.5 h-3.5 shrink-0" />
        <span className="truncate">{triggerLabel}</span>
        <ChevronDown
          className={`w-3.5 h-3.5 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div
          className={`absolute z-30 mt-2 bg-white border border-[#E7E3DB] rounded-2xl shadow-lg p-4 space-y-3 ${popoverSize}`}
        >
          {/* Quick presets (the old dropdown's options, as chips) */}
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map((p) => (
              <button
                key={p.value}
                type="button"
                onClick={() => handlePreset(p.value)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
                  dateRange === p.value
                    ? 'bg-[#1E3F35] text-white font-semibold'
                    : 'bg-white text-[#5F635D] border border-[#E2DFD8] hover:bg-[#F4F1EA] hover:text-[#1E2320]'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Month navigation */}
          <div className="flex items-center justify-between">
            <button
              type="button"
              aria-label="Previous month"
              onClick={() => shiftMonth(-1)}
              className="p-1.5 rounded-lg text-[#5F635D] hover:text-[#1E2320] hover:bg-[#F4F1EA] transition-colors cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <p className="font-editorial text-sm font-bold text-[#1E2320]">
              {monthLabel(view.year, view.month)}
            </p>
            <button
              type="button"
              aria-label="Next month"
              onClick={() => shiftMonth(1)}
              className="p-1.5 rounded-lg text-[#5F635D] hover:text-[#1E2320] hover:bg-[#F4F1EA] transition-colors cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Weekday header */}
          <div className="grid grid-cols-7 gap-1 text-center">
            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
              <span key={i} className="text-[11px] font-semibold text-[#8C887E]">
                {d}
              </span>
            ))}
          </div>

          {/* Days */}
          <div className="grid grid-cols-7 gap-1">
            {days.map((cell) => {
              const isStart = pickStart === cell.date;
              const isEnd = pickEnd === cell.date;
              const inRange =
                pickStart && pickEnd && cell.date > pickStart && cell.date < pickEnd;
              const isToday = cell.date === today;
              // A selected day keeps its forest highlight even if it
              // has since become past (an older shared range) — it is
              // the active filter, just no longer pickable. Any other
              // past day is muted and disabled.
              const isPast = cell.date < today;
              return (
                <button
                  key={cell.date}
                  type="button"
                  aria-label={formatDayLong(cell.date)}
                  disabled={isPast && !isStart && !isEnd}
                  onClick={() => handleDayClick(cell.date)}
                  className={`h-9 rounded-lg text-xs transition-colors ${
                    isStart || isEnd
                      ? 'bg-[#1E3F35] text-white font-semibold cursor-pointer'
                      : isPast
                        ? 'text-[#C9C4B8] opacity-50 cursor-not-allowed'
                        : inRange
                          ? 'bg-[#EAF1ED] text-[#1E2320] cursor-pointer'
                          : cell.inMonth
                            ? 'text-[#1E2320] hover:bg-[#F4F1EA] cursor-pointer'
                            : 'text-[#C9C4B8] hover:bg-[#F4F1EA] cursor-pointer'
                  } ${isToday && !isStart && !isEnd ? 'ring-1 ring-[#1E3F35]/40 font-semibold' : ''}`}
                >
                  {cell.day}
                </button>
              );
            })}
          </div>

          <p className="text-[11px] text-[#5F635D] leading-relaxed">{hint}</p>

          {/* Footer: clear the range, or close */}
          <div className="flex items-center justify-between pt-1 border-t border-[#EBE7DF]">
            <button
              type="button"
              onClick={handleAnyDates}
              className="px-3 py-2 text-xs font-semibold text-[#1E3F35] hover:underline cursor-pointer"
            >
              Any dates
            </button>
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
