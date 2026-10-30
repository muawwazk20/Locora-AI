import type { UserProfile } from '../types';

// Why this file exists: the profile lives ONLY in the browser session
// (localStorage 'locora_current_user'). There is no server user table,
// so every sign-in rebuilds the profile from scratch — local sign-in
// from a demo template, Google sign-in from Google's userinfo — and
// anything the user saved on Profile (mobile number, home location,
// bio, interests) was silently lost at the next login.
//
// Fix: every profile save also writes a per-email backup that survives
// logout (logout clears the session key only), and every sign-in
// restores it on top of the freshly built profile. The Google callback
// page mirrors this field list in its own inline script (it cannot
// import this file), so keep the two lists in sync.
//
// NEVER restored from the backup: id, email, role, authProvider.
// Those come from the sign-in itself — restoring a role from a browser
// value would reopen the organizer/admin self-grant the app closed.

export type SavedProfileFields = Partial<
  Pick<
    UserProfile,
    'name' | 'phone' | 'phoneVerified' | 'bio' | 'country' | 'state' | 'city' | 'interests'
  >
>;

export interface ProfileStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function savedProfileKey(email: string): string {
  return `locora_saved_profile_${email.trim().toLowerCase()}`;
}

export function readSavedProfile(
  storage: ProfileStorage,
  email: string,
): SavedProfileFields | null {
  try {
    if (!email) return null;
    const raw = storage.getItem(savedProfileKey(email));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed as SavedProfileFields;
  } catch {
    return null;
  }
}

// Writes the backup from a COMPLETE user object (post-merge), never
// from a partial update — a partial save must not blank the fields it
// did not touch. Storage failures (private mode, quota) are swallowed:
// the session itself still works, the backup just does not survive.
export function writeSavedProfile(storage: ProfileStorage, user: UserProfile): void {
  try {
    if (!user.email) return;
    const fields: SavedProfileFields = {
      name: user.name,
      phone: user.phone,
      phoneVerified: user.phoneVerified,
      bio: user.bio,
      country: user.country,
      state: user.state,
      city: user.city,
      interests: user.interests,
    };
    storage.setItem(savedProfileKey(user.email), JSON.stringify(fields));
  } catch {
    // Backup is best-effort; never break a profile save.
  }
}

// Layers a saved backup over a freshly built sign-in profile. Local
// accounts have no authoritative name source, so a saved display name
// survives; Google accounts always take Google's name.
export function restoreSavedProfile(
  storage: ProfileStorage,
  base: UserProfile,
): UserProfile {
  const saved = readSavedProfile(storage, base.email);
  if (!saved) return base;
  return restoreFromFields(base, saved);
}

// Same merge, but with the backup supplied (used by tests and by any
// caller that already read it).
export function restoreFromFields(
  base: UserProfile,
  saved: SavedProfileFields,
): UserProfile {
  const restored: UserProfile = { ...base };
  if (saved.phone !== undefined) restored.phone = saved.phone;
  if (saved.phoneVerified !== undefined) restored.phoneVerified = saved.phoneVerified;
  if (saved.bio !== undefined) restored.bio = saved.bio;
  if (saved.country !== undefined) restored.country = saved.country;
  if (saved.state !== undefined) restored.state = saved.state;
  if (saved.city !== undefined) restored.city = saved.city;
  if (Array.isArray(saved.interests)) restored.interests = saved.interests;
  if (base.authProvider === 'local' && saved.name) restored.name = saved.name;
  return restored;
}
