import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { EventItem, EventFilterOptions } from '../types';
import { eventsService } from '../services/events-service';
import { authService } from '../services/auth-service';
import { EventCard } from '../components/events/EventCard';
import { EventFilters } from '../components/events/EventFilters';
import { EventListSkeleton, EmptyState } from '../components/ui/LoadingSkeleton';
import { useToast } from '../components/ui/Toast';

export function DiscoverPage() {
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const [filters, setFilters] = useState<EventFilterOptions>({
    query: searchParams.get('q') || '',
    category: searchParams.get('category') || 'All',
    country: searchParams.get('country') || '',
    state: searchParams.get('state') || '',
    city: searchParams.get('city') || '',
    dateRange: (searchParams.get('dateRange') as EventFilterOptions['dateRange']) || 'all',
    startDate: searchParams.get('startDate') || '',
    endDate: searchParams.get('endDate') || '',
    priceType: (searchParams.get('priceType') as EventFilterOptions['priceType']) || 'all',
    sortBy: (searchParams.get('sortBy') as EventFilterOptions['sortBy']) || 'relevance',
  });

  // Saved home location (from Profile) for the one-tap "Near me" filter.
  const savedUser = authService.getCurrentUser();
  const savedLocationLabel = savedUser?.city
    ? [savedUser.city, savedUser.state, savedUser.country].filter(Boolean).join(', ')
    : '';
  const handleSavedLocation = () => {
    if (!savedUser?.city) return;
    updateFilters({
      ...filters,
      country: savedUser.country || '',
      state: savedUser.state || '',
      city: savedUser.city,
    });
  };

  const [events, setEvents] = useState<EventItem[]>([]);
  const [totalResults, setTotalResults] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // Sync state with URL params
  const updateFilters = useCallback(
    (newFilters: EventFilterOptions) => {
      setFilters(newFilters);
      setPage(1);

      const params = new URLSearchParams();
      if (newFilters.query) params.set('q', newFilters.query);
      if (newFilters.category && newFilters.category !== 'All') params.set('category', newFilters.category);
      if (newFilters.country) params.set('country', newFilters.country);
      if (newFilters.state) params.set('state', newFilters.state);
      if (newFilters.city) params.set('city', newFilters.city);
      if (newFilters.dateRange && newFilters.dateRange !== 'all') params.set('dateRange', newFilters.dateRange);
      if (newFilters.dateRange === 'custom' && newFilters.startDate && newFilters.endDate) {
        params.set('startDate', newFilters.startDate);
        params.set('endDate', newFilters.endDate);
      }
      if (newFilters.priceType && newFilters.priceType !== 'all') params.set('priceType', newFilters.priceType);
      if (newFilters.sortBy && newFilters.sortBy !== 'relevance') params.set('sortBy', newFilters.sortBy);

      setSearchParams(params);
    },
    [setSearchParams]
  );

  // Debounce the search text for fetching: typing currently refetches
  // (a ~2s call plus a skeleton flash) on every keystroke. The search
  // box and the URL still update immediately; only the fetch waits for
  // a pause in typing. Other filters fetch at once, as before.
  const [debouncedQuery, setDebouncedQuery] = useState(filters.query);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(filters.query), 350);
    return () => clearTimeout(t);
  }, [filters.query]);
  const effectiveFilters = useMemo(
    () => ({ ...filters, query: debouncedQuery }),
    [filters, debouncedQuery],
  );

  // Fetch events on filter or page change
  useEffect(() => {
    let active = true;
    async function fetchEvents() {
      setLoading(true);
      try {
        const response = await eventsService.getEvents(effectiveFilters, page, 9);
        if (active) {
          setEvents(response.data);
          setTotalResults(response.total);
          setTotalPages(response.totalPages);
        }
      } catch (err) {
        console.error('Failed to load events:', err);
      } finally {
        if (active) setLoading(false);
      }
    }
    fetchEvents();
    return () => {
      active = false;
    };
  }, [effectiveFilters, page]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Header Banner */}
      <div className="pb-4 border-b border-[#E5E1D8]">
        <h1 className="font-editorial text-3xl sm:text-4xl font-bold tracking-tight text-[#1E2320]">
          Discover Local Events
        </h1>
        <p className="text-sm text-[#5F635D] mt-1">
          Explore activities, gatherings, and workshops near you — or pick
          any country, state, and city in the world.
        </p>
      </div>

      {/* Filter Toolbar */}
      <EventFilters
        filters={filters}
        onChange={updateFilters}
        totalResults={totalResults}
        onSavedLocation={savedLocationLabel ? handleSavedLocation : undefined}
        savedLocationLabel={savedLocationLabel}
      />

      {/* Main Events Presentation */}
      {loading ? (
        <EventListSkeleton count={6} />
      ) : events.length === 0 ? (
        <EmptyState
          icon="search"
          title="No events found"
          description="We couldn't find any events matching your selected filters. Try broadening your search or resetting category filters."
          actionLabel="Reset all filters"
          onAction={() =>
            updateFilters({
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
            })
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {events.map((event) => (
            <EventCard key={event.id} event={event} />
          ))}
        </div>
      )}

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="pt-8 border-t border-[#E5E1D8] flex items-center justify-between text-xs text-[#5F635D]">
          <p>
            Page <span className="font-semibold tabular-nums text-[#1E2320]">{page}</span> of{' '}
            <span className="font-semibold tabular-nums text-[#1E2320]">{totalPages}</span>
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="px-3.5 py-1.5 rounded-lg border border-[#E2DFD8] bg-white hover:bg-[#F4F1EA] text-[#1E2320] disabled:opacity-40 disabled:pointer-events-none transition-colors"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="px-3.5 py-1.5 rounded-lg border border-[#E2DFD8] bg-white hover:bg-[#F4F1EA] text-[#1E2320] disabled:opacity-40 disabled:pointer-events-none transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
