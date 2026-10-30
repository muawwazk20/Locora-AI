// Worldwide location data: Country -> State -> City.
//
// States and cities come from the free CountriesNow API (no key needed).
// The picker falls back to free-text inputs whenever that API is
// unreachable, so location selection never hard-depends on it. Results are
// cached in memory per country/state for the session.
//
// "Near me" detection uses the browser's geolocation plus OpenStreetMap's
// free Nominatim reverse-geocoder (also no key). It resolves to a
// country/state/city, and Discover then matches events in that city —
// events do not carry GPS coordinates, so "nearby" here means "in your
// city", not a radius search.

export interface WorldLocation {
  country: string;
  state: string;
  city: string;
}

const statesCache = new Map<string, string[]>();
const citiesCache = new Map<string, string[]>();

async function postJson(url: string, body: unknown): Promise<any | null> {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function fetchStates(country: string): Promise<string[] | null> {
  const key = country.trim();
  if (!key) return null;
  const cached = statesCache.get(key);
  if (cached) return cached;
  const data = await postJson('https://countriesnow.space/api/v0.1/countries/states', {
    country: key,
  });
  const states = data?.data?.states;
  if (!Array.isArray(states) || states.length === 0) return null;
  const names = states.map((s: any) => s.name).filter(Boolean);
  if (names.length === 0) return null;
  statesCache.set(key, names);
  return names;
}

export async function fetchCities(country: string, state: string): Promise<string[] | null> {
  const key = `${country.trim()}|${state.trim()}`;
  if (!country.trim() || !state.trim()) return null;
  const cached = citiesCache.get(key);
  if (cached) return cached;
  const data = await postJson('https://countriesnow.space/api/v0.1/countries/state/cities', {
    country: country.trim(),
    state: state.trim(),
  });
  const cities = data?.data;
  if (!Array.isArray(cities) || cities.length === 0) return null;
  const names = cities.filter(Boolean);
  citiesCache.set(key, names);
  return names;
}

function getPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new Error('Geolocation is not available in this browser.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10000 });
  });
}

// Best-effort detection: returns null (instead of throwing) when the user
// denies permission, geolocation fails, or reverse-geocoding fails, so the
// caller can fall back to the manual picker.
export async function detectLocation(): Promise<WorldLocation | null> {
  try {
    const pos = await getPosition();
    const { latitude, longitude } = pos.coords;
    const url =
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2` +
      `&lat=${latitude}&lon=${longitude}&addressdetails=1`;
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) return null;
    const data = await res.json();
    const addr = data?.address || {};
    const city = addr.city || addr.town || addr.village || addr.municipality || addr.county || '';
    const state = addr.state || addr.region || '';
    const country = addr.country || '';
    if (!country && !city) return null;
    return { country, state, city };
  } catch {
    return null;
  }
}
