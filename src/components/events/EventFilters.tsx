import React, { useState, useRef, useEffect } from 'react';
import { Search, SlidersHorizontal, X, RotateCcw, MapPin, ChevronDown } from 'lucide-react';
import { EventFilterOptions } from '../../types';
import { DEMO_CATEGORIES } from '../../mocks/demo-data';
import { LocationPicker } from '../LocationPicker';
import { ThemedSelect } from '../ui/ThemedSelect';
import { DateRangePicker } from './DateRangePicker';

interface EventFiltersProps {
  filters: EventFilterOptions;
  onChange: (updated: EventFilterOptions) => void;
  totalResults: number;
  // Set when the signed-in user has a saved home location (Profile):
  // shows a one-tap "near me" button for that location.
  onSavedLocation?: () => void;
  savedLocationLabel?: string;
}

export function EventFilters({ filters, onChange, totalResults, onSavedLocation, savedLocationLabel }: EventFiltersProps) {
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

  // Location dropdown beside the search box: the full Country -> State ->
  // City card lives inside this panel instead of sitting as a permanent
  // block below the toolbar. It stays open while picking (country, then
  // state, then city) and closes on outside click, Escape, or Done.
  const [locationOpen, setLocationOpen] = useState(false);
  const locationWrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!locationOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      if (locationWrapRef.current && !locationWrapRef.current.contains(e.target as Node)) {
        setLocationOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLocationOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [locationOpen]);

  const activeLocationLabel = [filters.city, filters.state, filters.country]
    .filter(Boolean)
    .join(', ');

  const activeCategory = filters.category || 'All';
  const hasActiveFilters =
    Boolean(filters.query) ||
    Boolean(filters.category && filters.category !== 'All') ||
    Boolean(filters.country) ||
    Boolean(filters.state) ||
    Boolean(filters.city) ||
    Boolean(filters.dateRange && filters.dateRange !== 'all') ||
    Boolean(filters.priceType && filters.priceType !== 'all');

  const handleClearAll = () => {
    onChange({
      query: '',
      category: 'All',
      country: '',
      state: '',
      city: '',
      dateRange: 'all',
      startDate: '',
      endDate: '',
      priceType: 'all',
      sortBy: 'relevance',
    });
  };

  const locationValue = {
    country: filters.country || '',
    state: filters.state || '',
    city: filters.city || '',
  };

  return (
    <div className="space-y-4 mb-8">
      <div ref={locationWrapRef}>
      {/* Top Search & Mobile Filter Toggle */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
        {/* Search Bar */}
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={filters.query || ''}
            onChange={(e) => onChange({ ...filters, query: e.target.value })}
            placeholder="Search events by keyword, venue, or tag..."
            className="w-full pl-10 pr-10 py-2.5 text-sm bg-white rounded-xl border border-[#E2DFD8] text-[#1E2320] placeholder:text-[#8C887E] focus:border-[#1E3F35] focus:ring-1 focus:ring-[#1E3F35] transition-colors shadow-2xs"
          />
          {filters.query && (
            <button
              onClick={() => onChange({ ...filters, query: '' })}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8C887E] hover:text-[#1E2320] p-1"
              aria-label="Clear search"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Location dropdown trigger, beside the search box */}
        <button
          type="button"
          onClick={() => setLocationOpen((open) => !open)}
          aria-expanded={locationOpen}
          className={`inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl border text-xs font-medium shadow-2xs transition-colors cursor-pointer shrink-0 ${
            activeLocationLabel
              ? 'border-[#1E3F35]/20 bg-[#EAF1ED] text-[#1E3F35]'
              : 'border-[#E2DFD8] bg-white text-[#1E2320] hover:bg-[#F4F1EA]'
          }`}
        >
          <MapPin className="w-3.5 h-3.5 shrink-0" />
          <span className="max-w-[160px] sm:max-w-[220px] truncate">
            {activeLocationLabel || 'Location'}
          </span>
          <ChevronDown className={`w-3.5 h-3.5 shrink-0 transition-transform ${locationOpen ? 'rotate-180' : ''}`} />
        </button>

        {/* Mobile Filters Trigger */}
        <div className="flex sm:hidden items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => { setMobileDrawerOpen(true); setLocationOpen(false); }}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-white border border-[#E2DFD8] rounded-xl text-xs font-medium text-[#1E2320] shadow-2xs"
          >
            <SlidersHorizontal className="w-4 h-4" />
            <span>Filter</span>
            {hasActiveFilters && (
              <span className="w-2 h-2 rounded-full bg-[#1E3F35] ml-1" />
            )}
          </button>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={handleClearAll}
              className="p-2.5 text-[#5F635D] hover:text-[#1E2320] bg-white border border-[#E2DFD8] rounded-xl"
              aria-label="Reset filters"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Desktop Dropdowns: Date (calendar) & Price (location is the card below) */}
        <div className="hidden sm:flex items-center gap-3 shrink-0">
          <DateRangePicker
            dateRange={filters.dateRange}
            startDate={filters.startDate}
            endDate={filters.endDate}
            onChange={(patch) => onChange({ ...filters, ...patch })}
            size="bar"
          />

          <ThemedSelect
            value={filters.priceType || 'all'}
            options={[
              { value: 'all', label: 'All prices' },
              { value: 'free', label: 'Free' },
              { value: 'paid', label: 'Paid' },
            ]}
            onChange={(v) =>
              onChange({
                ...filters,
                priceType: v as EventFilterOptions['priceType'],
              })
            }
            ariaLabel="Filter by price"
            size="bar"
          />
        </div>
      </div>

      {/* Location dropdown panel: the same Country -> State -> City card,
          shown only while the dropdown beside the search box is open. */}
      {locationOpen && (
      <div className="bg-white border border-[#E2DFD8] rounded-xl p-3 sm:p-4 space-y-2 shadow-2xs mt-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <p className="text-xs font-semibold text-[#1E2320] flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5 text-[#1E3F35]" />
            Location
          </p>
          <div className="flex items-center gap-3 flex-wrap">
            {onSavedLocation && savedLocationLabel && (
              <button
                type="button"
                onClick={onSavedLocation}
                className="text-[11px] font-semibold text-[#1E3F35] hover:underline"
              >
                Near me: {savedLocationLabel}
              </button>
            )}
            <button
              type="button"
              onClick={() => setLocationOpen(false)}
              className="text-[11px] font-semibold text-[#1E3F35] hover:underline"
            >
              Done
            </button>
          </div>
        </div>
        <LocationPicker
          mode="filter"
          showDetect
          value={locationValue}
          onChange={(loc) =>
            onChange({ ...filters, country: loc.country, state: loc.state, city: loc.city })
          }
        />
      </div>
      )}
      </div>

      {/* Interactive Category Segmented Strip */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
        <button
          type="button"
          onClick={() => onChange({ ...filters, category: 'All' })}
          className={`px-3.5 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
            activeCategory === 'All'
              ? 'bg-[#1E3F35] text-white shadow-2xs font-semibold'
              : 'bg-white text-[#5F635D] hover:text-[#1E2320] border border-[#E2DFD8] hover:bg-[#F4F1EA]'
          }`}
        >
          All Categories
        </button>
        {DEMO_CATEGORIES.map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => onChange({ ...filters, category: cat })}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
              activeCategory === cat
                ? 'bg-[#1E3F35] text-white shadow-2xs font-semibold'
                : 'bg-white text-[#5F635D] hover:text-[#1E2320] border border-[#E2DFD8] hover:bg-[#F4F1EA]'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Filter Metadata & Clear All */}
      <div className="flex items-center justify-between text-xs text-[#5F635D] pt-1">
        <span className="tabular-nums font-medium">
          Showing {totalResults} {totalResults === 1 ? 'event' : 'events'}
        </span>

        {hasActiveFilters && (
          <button
            type="button"
            onClick={handleClearAll}
            className="inline-flex items-center gap-1 text-xs font-medium text-[#1E3F35] hover:text-[#163028] transition-colors whitespace-nowrap"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset all filters</span>
          </button>
        )}
      </div>

      {/* Mobile Drawer */}
      {mobileDrawerOpen && (
        <div
          className="fixed inset-0 z-50 flex flex-col justify-end bg-black/40 backdrop-blur-xs sm:hidden"
          onClick={(e) => {
            if (e.target === e.currentTarget) setMobileDrawerOpen(false);
          }}
        >
          <div className="bg-[#FAF8F5] rounded-t-2xl p-6 space-y-4 max-h-[85vh] overflow-y-auto border-t border-[#E2DFD8]">
            <div className="flex items-center justify-between pb-3 border-b border-[#E2DFD8]">
              <h3 className="font-editorial text-lg font-bold text-[#1E2320]">Filters</h3>
              <button
                onClick={() => setMobileDrawerOpen(false)}
                className="p-1.5 text-[#8C887E] hover:text-[#1E2320]"
                aria-label="Close filters"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#1E2320] mb-1.5">Location (worldwide)</label>
              <LocationPicker
                mode="filter"
                showDetect
                value={locationValue}
                onChange={(loc) =>
                  onChange({ ...filters, country: loc.country, state: loc.state, city: loc.city })
                }
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#1E2320] mb-1.5">Date Range</label>
              <DateRangePicker
                dateRange={filters.dateRange}
                startDate={filters.startDate}
                endDate={filters.endDate}
                onChange={(patch) => onChange({ ...filters, ...patch })}
                size="drawer"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#1E2320] mb-1.5">Price</label>
              <ThemedSelect
                value={filters.priceType || 'all'}
                options={[
                  { value: 'all', label: 'All prices' },
                  { value: 'free', label: 'Free' },
                  { value: 'paid', label: 'Paid' },
                ]}
                onChange={(v) =>
                  onChange({
                    ...filters,
                    priceType: v as EventFilterOptions['priceType'],
                  })
                }
                ariaLabel="Filter by price"
                size="drawer"
              />
            </div>

            <div className="pt-4 flex gap-3">
              <button
                type="button"
                onClick={handleClearAll}
                className="flex-1 py-3 text-xs font-medium text-[#1E2320] bg-white border border-[#E2DFD8] rounded-xl"
              >
                Reset
              </button>
              <button
                type="button"
                onClick={() => setMobileDrawerOpen(false)}
                className="flex-1 py-3 text-xs font-medium text-white bg-[#1E3F35] hover:bg-[#163028] rounded-xl shadow-xs"
              >
                Show {totalResults} Results
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
