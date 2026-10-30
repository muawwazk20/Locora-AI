import React, { useEffect, useState } from 'react';
import { Navigation } from 'lucide-react';
import { WORLD_COUNTRIES } from '../data/world-countries';
import {
  fetchStates,
  fetchCities,
  detectLocation,
  WorldLocation,
} from '../services/location-service';
import { ThemedSelect } from './ui/ThemedSelect';

interface LocationPickerProps {
  value: WorldLocation;
  onChange: (loc: WorldLocation) => void;
  // 'filter' shows "Anywhere" as the empty option (Discover); 'form' shows
  // "Select country/state/city" (Profile, Create Event).
  mode?: 'filter' | 'form';
  // Shows the "Use my location" button (Discover). Detection failures are
  // shown inline; the manual picker always remains available.
  showDetect?: boolean;
}

const inputClass =
  'w-full text-xs bg-white border border-[#E2DFD8] rounded-lg p-2.5 text-[#1E2320] focus:border-[#1E3F35]';

export function LocationPicker({
  value,
  onChange,
  mode = 'form',
  showDetect = false,
}: LocationPickerProps) {
  const [states, setStates] = useState<string[] | null>(null);
  const [statesLoading, setStatesLoading] = useState(false);
  const [statesFailed, setStatesFailed] = useState(false);
  const [cities, setCities] = useState<string[] | null>(null);
  const [citiesLoading, setCitiesLoading] = useState(false);
  const [citiesFailed, setCitiesFailed] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [detectError, setDetectError] = useState('');

  const emptyLabel =
    mode === 'filter' ? 'Anywhere' : 'Select country';
  const emptyStateLabel =
    mode === 'filter' ? 'Any state' : 'Select state';
  const emptyCityLabel =
    mode === 'filter' ? 'Any city' : 'Select city';

  // Load states whenever the country changes; fall back to a free-text
  // state field when the states API is unreachable for that country.
  useEffect(() => {
    if (!value.country) {
      setStates(null);
      setStatesFailed(false);
      return;
    }
    let cancelled = false;
    setStatesLoading(true);
    setStatesFailed(false);
    fetchStates(value.country).then((list) => {
      if (cancelled) return;
      setStatesLoading(false);
      if (list) {
        setStates(list);
      } else {
        setStates(null);
        setStatesFailed(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [value.country]);

  // Load cities whenever country+state change; same text fallback.
  useEffect(() => {
    if (!value.country || !value.state) {
      setCities(null);
      setCitiesFailed(false);
      return;
    }
    let cancelled = false;
    setCitiesLoading(true);
    setCitiesFailed(false);
    fetchCities(value.country, value.state).then((list) => {
      if (cancelled) return;
      setCitiesLoading(false);
      if (list) {
        setCities(list);
      } else {
        setCities(null);
        setCitiesFailed(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [value.country, value.state]);

  const handleDetect = async () => {
    setDetecting(true);
    setDetectError('');
    const loc = await detectLocation();
    setDetecting(false);
    if (!loc) {
      setDetectError(
        'Could not detect your location. Please allow location access, or pick your location below.',
      );
      return;
    }
    onChange({ country: loc.country, state: loc.state, city: loc.city });
  };

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="block text-xs font-semibold text-[#1E2320] mb-1.5">
            Country
          </label>
          <ThemedSelect
            value={value.country}
            options={[
              { value: '', label: emptyLabel },
              ...WORLD_COUNTRIES.map((c) => ({ value: c, label: c })),
            ]}
            onChange={(v) => onChange({ country: v, state: '', city: '' })}
            ariaLabel="Country"
            size="form"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-[#1E2320] mb-1.5">
            State
          </label>
          {statesFailed || (value.country && !statesLoading && !states) ? (
            <input
              type="text"
              value={value.state}
              onChange={(e) => onChange({ ...value, state: e.target.value, city: '' })}
              placeholder={
                statesFailed
                  ? 'State list unavailable — type any state'
                  : 'Type a state'
              }
              className={inputClass}
            />
          ) : (
            <ThemedSelect
              value={value.state}
              options={[
                { value: '', label: statesLoading ? 'Loading states…' : emptyStateLabel },
                ...(states || []).map((s) => ({ value: s, label: s })),
              ]}
              onChange={(v) => onChange({ ...value, state: v, city: '' })}
              ariaLabel="State"
              disabled={!value.country || statesLoading}
              size="form"
            />
          )}
        </div>

        <div>
          <label className="block text-xs font-semibold text-[#1E2320] mb-1.5">
            City
          </label>
          {citiesFailed || (value.state && !citiesLoading && !cities) ? (
            <input
              type="text"
              value={value.city}
              onChange={(e) => onChange({ ...value, city: e.target.value })}
              placeholder={
                citiesFailed
                  ? 'City list unavailable — type any city'
                  : 'Type a city'
              }
              className={inputClass}
            />
          ) : cities && cities.length > 0 &&
            (value.city === '' || cities.includes(value.city)) ? (
            <ThemedSelect
              value={value.city}
              options={[
                { value: '', label: citiesLoading ? 'Loading cities…' : emptyCityLabel },
                ...cities.map((c) => ({ value: c, label: c })),
              ]}
              onChange={(v) => onChange({ ...value, city: v })}
              ariaLabel="City"
              disabled={citiesLoading}
              size="form"
            />
          ) : (
            <input
              type="text"
              value={value.city}
              onChange={(e) => onChange({ ...value, city: e.target.value })}
              placeholder={
                !value.state
                  ? 'Select a state first, or type a city'
                  : 'Type a city'
              }
              className={inputClass}
            />
          )}
        </div>
      </div>

      {showDetect && (
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={handleDetect}
            disabled={detecting}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-[#1E3F35] bg-[#EAF1ED] hover:bg-[#DCEAE3] border border-[#D0E2D9] rounded-lg transition-colors cursor-pointer"
          >
            <Navigation className="w-3.5 h-3.5" />
            {detecting ? 'Detecting…' : 'Near me — use my location'}
          </button>
          {detectError && (
            <p className="text-[11px] text-rose-600">{detectError}</p>
          )}
          <p className="text-[11px] text-[#5F635D]">
            Nearby means events in your city — pick any other location to
            browse events there instead.
          </p>
        </div>
      )}
    </div>
  );
}
