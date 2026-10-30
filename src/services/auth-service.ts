// SECURITY FIX — Phase 2 P2-2: the demo-login fallback is GONE.
// There is no DEFAULT_DEMO_USER session, no 'demo_jwt_token_locora_preview',
// and no localStorage session on login/signup failure. Login and signup
// call the server only; the server sets an HttpOnly locora_session cookie
// (never returned in the JSON body, never stored by this file). A failed
// server login throws — it never signs the user in. Existing local demo
// accounts must re-sign up (see FIX_SUMMARY.md).
import { UserProfile } from '../types';
import { isDemoMode, apiClient } from './api-client';
import { ADMIN_EMAILS } from './roles-service';
import { restoreSavedProfile, writeSavedProfile } from '../utils/saved-profile';

// Roles are no longer self-selected. Everyone starts as an attendee;
// organizer status comes only from an admin approval (see roles-service),
// and admin status comes only from a Google sign-in with an admin email
// (see api/auth/callback/google.ts). The old paths that let anyone become
// an organizer — the sign-up role toggle, the Google role parameter, the
// instant demo role switch, and the "email contains org" demo heuristic —
// are all removed here. Admin emails are also refused by the local
// password fallback below, so an admin account cannot be claimed by typing
// its email into the sign-in form; admins must sign in with Google, whose
// email Google itself verifies.

const USER_STORAGE_KEY = 'locora_current_user';
const TOKEN_STORAGE_KEY = 'locora_auth_token';

type AuthListener = (user: UserProfile | null) => void;
const listeners = new Set<AuthListener>();

function notify(user: UserProfile | null) {
  listeners.forEach((cb) => cb(user));
}

// Account emails for local sign-in / sign-up (Google sign-ins are
// covered by the callback page instead, so this never runs for them).
// Fire-and-forget with keepalive: the /api/notify endpoint caps sends
// and ignores failures, and nothing here may ever block or fail auth.
// Callers pass the email the user actually typed, never a fallback:
// an empty typed email means "demo profile", which gets no mail.
function sendAccountEmail(action: 'welcome' | 'login', user: UserProfile, typedEmail: string): void {
  try {
    const email = (typedEmail || '').trim();
    if (!email) return;
    fetch('/api/notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, email, name: user.name || '' }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Never break sign-in / sign-up.
  }
}

export const authService = {
  subscribe(listener: AuthListener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  getCurrentUser(): UserProfile | null {
    try {
      const raw = localStorage.getItem(USER_STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  },

  // Google sign-in via the server-side OAuth flow.
  //
  // Visitors never need a Client ID and never see a setup dialog.
  // This redirects the browser to /api/auth/google (a Vercel Serverless
  // Function), which uses GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET from
  // Vercel environment variables only. Google then redirects back to
  // /api/auth/google/callback, which stores the profile in localStorage
  // and sends the user to /dashboard. Because the page navigates away,
  // this promise intentionally never resolves.
  async loginWithGoogle(): Promise<UserProfile> {
    // Role is intentionally not passed: the callback assigns 'admin' to
    // admin emails and 'attendee' to everyone else. Nobody can choose
    // 'organizer' at sign-in anymore.
    window.location.href = '/api/auth/google?role=attendee';
    return new Promise<UserProfile>(() => {});
  },

  async login(email: string, password?: string): Promise<UserProfile> {
    if (!password) throw new Error('Invalid credentials');
    const res = await apiClient.post<{ user: UserProfile }>('/auth/login', { email, password });
    const user = restoreSavedProfile(localStorage, res.user);
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
    // Cookie was set by /api/auth/login, so the session-gated /api/notify
    // call below passes; it is fire-and-forget and never blocks sign-in.
    sendAccountEmail('login', user, email);
    notify(user);
    return user;
  },

  async signup(name: string, email: string, password?: string): Promise<UserProfile> {
    // Every new account starts as an attendee. Organizer status is granted
    // later by an admin approval, never chosen at sign-up.
    if (!password || password.length < 6) throw new Error('Password must be at least 6 characters');
    if (ADMIN_EMAILS.includes(email.trim().toLowerCase())) {
      throw new Error('Admin accounts must sign in with Google.');
    }
    const res = await apiClient.post<{ user: UserProfile }>('/auth/signup', { name, email, password });
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(res.user));
    writeSavedProfile(localStorage, res.user);
    sendAccountEmail('welcome', res.user, email);
    notify(res.user);
    return res.user;
  },

  async logout(): Promise<void> {
    try { await apiClient.post('/auth/logout', {}); } catch { /* cookie clear is best-effort; local state still clears */ }
    localStorage.removeItem(USER_STORAGE_KEY);
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    // The per-email backup (utils/saved-profile.ts) intentionally stays:
    // it is what the next login restores the saved number from.
    // Limitation: the server JWT stays valid until expiry if copied —
    // see FIX_SUMMARY.md (no revocation list yet).
    notify(null);
  },

  async updateProfile(updates: Partial<UserProfile>): Promise<UserProfile> {
    // Role and auth provider can never be changed through a profile edit;
    // they are set only by sign-in (admin) and admin approval (organizer).
    const { role: _role, authProvider: _authProvider, ...safeUpdates } = updates;
    if (!isDemoMode()) {
      try {
        const updated = await apiClient.patch<UserProfile>('/me', safeUpdates);
        localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(updated));
        writeSavedProfile(localStorage, updated);
        notify(updated);
        return updated;
      } catch (err) {
        console.warn('Backend updateProfile failed, falling back to local update:', err);
      }
    }

    const current = this.getCurrentUser();
    if (!current) throw new Error('Not authenticated');

    const updated = { ...current, ...safeUpdates };
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(updated));
    // Every profile save refreshes the backup, so the saved number (and
    // its verification flag, home location, bio) survive the next login.
    writeSavedProfile(localStorage, updated);
    notify(updated);
    return updated;
  },
};
