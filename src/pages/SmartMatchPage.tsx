import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Sparkles, Sliders, Check, MapPin, CheckCircle } from 'lucide-react';
import { formatEventLocation } from '../utils/formatters';
import { EventCategory, SmartMatchResult } from '../types';
import { DEMO_CATEGORIES } from '../mocks/demo-data';
import { smartMatchService } from '../services/smart-match-service';
import { authService } from '../services/auth-service';
import { EventCard } from '../components/events/EventCard';
import { EventListSkeleton, EmptyState } from '../components/ui/LoadingSkeleton';

export function SmartMatchPage() {
  const currentUser = authService.getCurrentUser();

  const [selectedInterests, setSelectedInterests] = useState<EventCategory[]>(
    currentUser?.interests || ['Food & Community', 'Live Music & Culture']
  );
  // Home city, derived from the saved location under the location rule:
  // the city is the neighborhood when a state is selected, otherwise none.
  // It comes from Profile's Location Settings, not a separate control here.
  const homeCity = currentUser?.state ? (currentUser?.city || '') : '';
  const [preferFreeOnly, setPreferFreeOnly] = useState(false);

  const [results, setResults] = useState<SmartMatchResult[]>([]);
  const [loading, setLoading] = useState(true);

  const toggleInterest = (category: EventCategory) => {
    setSelectedInterests((prev) =>
      prev.includes(category) ? prev.filter((c) => c !== category) : [...prev, category]
    );
  };

  useEffect(() => {
    let active = true;
    async function fetchRecommendations() {
      setLoading(true);
      try {
        const matches = await smartMatchService.getRecommendations({
          userInterests: selectedInterests,
          preferredCity: homeCity,
          preferFreeOnly,
        });
        if (active) {
          setResults(matches);
        }
      } catch (err) {
        console.error('Failed to get recommendations:', err);
      } finally {
        if (active) setLoading(false);
      }
    }
    fetchRecommendations();
    return () => {
      active = false;
    };
  }, [selectedInterests, homeCity, preferFreeOnly]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-10">
      {/* Top Explanation Banner */}
      <div className="bg-white rounded-2xl border border-[#E5E1D8] p-6 sm:p-8 space-y-4 shadow-xs">
        <div className="flex items-center gap-2 text-[#1E3F35]">
          <Sparkles className="w-5 h-5" />
          <span className="text-xs font-bold uppercase tracking-wider">
            Deterministic Local Recommendation Engine
          </span>
        </div>
        <h1 className="font-editorial text-3xl sm:text-4xl font-bold tracking-tight text-[#1E2320]">
          Locora SmartMatch
        </h1>
        <p className="text-sm text-[#5F635D] max-w-2xl leading-relaxed">
          SmartMatch scores events according to your interest categories, home city proximity, and schedule availability. Each card explains the exact reasons for its recommendation.
        </p>
      </div>

      {/* Preferences Customizer Panel */}
      <div className="bg-white rounded-2xl border border-[#E5E1D8] p-6 space-y-6">
        <div className="flex items-center gap-2 pb-3 border-b border-[#EBE7DF]">
          <Sliders className="w-4 h-4 text-[#8C887E]" />
          <h2 className="font-editorial text-base font-bold text-[#1E2320]">
            Customize Recommendation Weights
          </h2>
        </div>

        {/* Interests Selector */}
        <div className="space-y-2">
          <label className="block text-xs font-semibold text-[#1E2320]">
            Select Your Interests ({selectedInterests.length} selected)
          </label>
          <div className="flex flex-wrap gap-2">
            {DEMO_CATEGORIES.map((cat) => {
              const active = selectedInterests.includes(cat);
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => toggleInterest(cat)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                    active
                      ? 'bg-[#1E3F35] text-white shadow-2xs font-semibold'
                      : 'bg-white text-[#5F635D] border border-[#E2DFD8] hover:bg-[#F4F1EA] hover:text-[#1E2320]'
                  }`}
                >
                  {active && <Check className="w-3.5 h-3.5" />}
                  <span>{cat}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Home city & Free admission toggle */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
          <div>
            <label className="block text-xs font-semibold text-[#1E2320] mb-1.5">
              Home City
            </label>
            <p className="text-xs text-[#5F635D] bg-white border border-[#E2DFD8] rounded-lg p-2.5">
              {homeCity ? (
                <>{homeCity} — events here rank higher</>
              ) : (
                <>
                  Not set —{' '}
                  <Link to="/profile" className="text-[#1E3F35] font-semibold underline">
                    set your home location in Profile
                  </Link>
                </>
              )}
            </p>
          </div>

          <div className="flex items-center gap-3 pt-6">
            <input
              type="checkbox"
              id="preferFree"
              checked={preferFreeOnly}
              onChange={(e) => setPreferFreeOnly(e.target.checked)}
              className="w-4 h-4 text-[#1E3F35] rounded border-[#E2DFD8] focus:ring-[#1E3F35]"
            />
            <label htmlFor="preferFree" className="text-xs font-medium text-[#1E2320] cursor-pointer">
              Prioritize 100% Free Admission Events
            </label>
          </div>
        </div>
      </div>

      {/* Recommended Results List */}
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="font-editorial text-2xl font-bold text-[#1E2320]">
            Top Matches ({results.length})
          </h2>
          <span className="text-xs text-[#5F635D]">
            Ranked by relevance score
          </span>
        </div>

        {loading ? (
          <EventListSkeleton count={6} />
        ) : results.length === 0 ? (
          <EmptyState
            icon="sparkles"
            title="No matching events found"
            description="Try selecting at least one interest category or updating your home city in your profile."
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {results.map(({ event, score, matchReasons }) => (
              <div key={event.id} className="flex flex-col space-y-2">
                {/* Score & Reasons Header */}
                <div className="p-3 bg-white rounded-xl border border-[#E5E1D8] text-xs space-y-1.5 shadow-2xs">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-[#1E3F35] flex items-center gap-1">
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>{score}% Match Score</span>
                    </span>
                    {formatEventLocation(event) && (
                      <span className="text-[11px] text-[#8C887E] tabular-nums">
                        {formatEventLocation(event)}
                      </span>
                    )}
                  </div>
                  <ul className="space-y-0.5 text-[11px] text-[#5F635D] list-disc list-inside">
                    {matchReasons.map((reason, i) => (
                      <li key={i} className="truncate">
                        {reason}
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Event Card */}
                <EventCard event={event} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
