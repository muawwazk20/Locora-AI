// Organizer access: who may post events, and how someone becomes an organizer.
//
// Roles:
// - attendee: every new account starts here. Attendees can discover events,
//   register, and save events. They cannot post events.
// - organizer: granted only by an admin approving a request. Organizers can
//   post and manage events.
// - admin: the admin accounts below. Admins can post events and approve or
//   reject organizer requests. Admins sign in with Google; the password
//   sign-in fallback refuses admin emails, so nobody can claim an admin
//   account by typing its email into the local sign-in form.
//
// ADMIN_EMAILS are identifiers, not secrets: they are checked again on the
// server (api/organizer-access.ts) before any approve/reject/list action.
// Never put a password in this file or anywhere else in the app.
//
// Shared state lives in Supabase (table organizer_access, one row per email)
// so an approval made by an admin on one device applies to the requester on
// any device. Until that table exists, the API answers 503 and the app fails
// closed: nobody is treated as an approved organizer from local data alone,
// except an admin signed in with Google (see OrganizerGuard).
export const ADMIN_EMAILS = [
  'mr.adeen946@gmail.com',
  'ayan.work937@gmail.com',
];

export type AccessRole = 'admin' | 'organizer' | 'pending' | 'attendee';

export function isAdminEmail(email: string): boolean {
  return ADMIN_EMAILS.includes(email.trim().toLowerCase());
}

export interface AccessInfo {
  email: string;
  role: AccessRole;
  status: 'approved' | 'pending' | 'rejected' | 'none' | 'admin';
}

export async function fetchAccess(email: string): Promise<AccessInfo | null> {
  try {
    const res = await fetch(
      `/api/organizer-access?email=${encodeURIComponent(email.trim().toLowerCase())}`,
    );
    if (!res.ok) return null;
    return (await res.json()) as AccessInfo;
  } catch {
    return null;
  }
}

export async function requestOrganizerAccess(
  email: string,
  name: string,
): Promise<AccessInfo> {
  const res = await fetch('/api/organizer-access', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'request',
      email: email.trim().toLowerCase(),
      name,
    }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message || 'Could not send the organizer request.');
  }
  return (await res.json()) as AccessInfo;
}

export interface PendingRequest {
  email: string;
  name: string;
  requestedAt: string;
}

export async function listPendingRequests(
  adminEmail: string,
): Promise<PendingRequest[]> {
  const res = await fetch(
    `/api/organizer-access?pending=1&adminEmail=${encodeURIComponent(
      adminEmail.trim().toLowerCase(),
    )}`,
  );
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message || 'Could not load organizer requests.');
  }
  const data = await res.json();
  return (data.pending || []) as PendingRequest[];
}

export async function decideRequest(
  adminEmail: string,
  targetEmail: string,
  approve: boolean,
): Promise<void> {
  const res = await fetch('/api/organizer-access', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: approve ? 'approve' : 'reject',
      adminEmail: adminEmail.trim().toLowerCase(),
      targetEmail: targetEmail.trim().toLowerCase(),
    }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message || 'Could not update the request.');
  }
}

export interface ApprovedOrganizer {
  email: string;
  name: string;
  approvedAt: string;
}

export async function listApprovedOrganizers(
  adminEmail: string,
): Promise<ApprovedOrganizer[]> {
  const res = await fetch(
    `/api/organizer-access?organizers=1&adminEmail=${encodeURIComponent(
      adminEmail.trim().toLowerCase(),
    )}`,
  );
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message || 'Could not load organizers.');
  }
  const data = await res.json();
  return (data.organizers || []) as ApprovedOrganizer[];
}

// Removes an approved organizer at any time. The target goes back to being
// an attendee and can request access again afterwards. Admins cannot be
// removed this way (the server refuses admin targets).
export async function revokeOrganizer(
  adminEmail: string,
  targetEmail: string,
): Promise<void> {
  const res = await fetch('/api/organizer-access', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'revoke',
      adminEmail: adminEmail.trim().toLowerCase(),
      targetEmail: targetEmail.trim().toLowerCase(),
    }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message || 'Could not remove the organizer.');
  }
}
