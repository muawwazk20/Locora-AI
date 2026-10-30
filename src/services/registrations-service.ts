// SECURITY FIX — Phase 1 Finding 1: this service no longer sends userId /
// approverEmail as identity. The server derives identity from the
// locora_session JWT cookie only; those body/query fields are ignored
// server-side. getMyRegistrations() calls /registrations with no params.
import { AttendeeRegistration, EventItem } from '../types';
import { DEMO_EVENTS } from '../mocks/demo-data';
import { eventsService } from './events-service';
import { authService } from './auth-service';
import { apiClient, ApiError, isDemoMode } from './api-client';

const REG_STORAGE_KEY = 'locora_registrations';

function getInitialRegistrations(): AttendeeRegistration[] {
  // No sample registrations: sample events (evt-1..evt-8) were removed,
  // so the prepopulated registrations for them are removed too.
  return [];
}

function getStoredRegistrations(): AttendeeRegistration[] {
  try {
    const raw = localStorage.getItem(REG_STORAGE_KEY);
    if (!raw) {
      const initial = getInitialRegistrations();
      localStorage.setItem(REG_STORAGE_KEY, JSON.stringify(initial));
      return initial;
    }
    const parsed = JSON.parse(raw);
    // Drop registrations for removed sample events (evt-1..evt-8).
    const sampleIds = new Set(['evt-1', 'evt-2', 'evt-3', 'evt-4', 'evt-5', 'evt-6', 'evt-7', 'evt-8']);
    const filtered = Array.isArray(parsed) ? parsed.filter((r: AttendeeRegistration) => !sampleIds.has(r.eventId)) : parsed;
    if (Array.isArray(parsed) && filtered.length !== parsed.length) {
      try { localStorage.setItem(REG_STORAGE_KEY, JSON.stringify(filtered)); } catch { /* keep filtered list in memory */ }
    }
    return filtered;
  } catch {
    return getInitialRegistrations();
  }
}

function saveStoredRegistrations(list: AttendeeRegistration[]): void {
  try {
    localStorage.setItem(REG_STORAGE_KEY, JSON.stringify(list));
  } catch (err) {
    console.error('Failed to save registrations:', err);
  }
}

function newTicketCode(): string {
  return `LOC-${Math.floor(1000 + Math.random() * 9000)}-TK`;
}

// Shared rows win over local rows with the same id. Every registration
// the user creates is written to both, so the merge is how a pass bought
// on one device shows up on another.
function mergeRegistrations(
  shared: AttendeeRegistration[],
  local: AttendeeRegistration[],
): AttendeeRegistration[] {
  const byId = new Map<string, AttendeeRegistration>();
  for (const r of local) byId.set(r.id, r);
  for (const r of shared) byId.set(r.id, r);
  return [...byId.values()].sort((a, b) => (b.registeredAt || '').localeCompare(a.registeredAt || ''));
}

export const registrationsService = {
  async getMyRegistrations(): Promise<AttendeeRegistration[]> {
    const user = authService.getCurrentUser();
    if (!user) return [];
    const local = getStoredRegistrations().filter((r) => r.userId === user.id);
    if (isDemoMode()) return local;
    try {
      const shared = await apiClient.get<AttendeeRegistration[]>('/registrations');
      return mergeRegistrations(Array.isArray(shared) ? shared : [], local);
    } catch (err) {
      // Shared registrations table not set up (or unreachable): fall back
      // to this browser's local registrations, like the event list does.
      console.warn('Shared registrations unavailable, falling back to local registrations:', err);
      await new Promise((resolve) => setTimeout(resolve, 150));
      return local;
    }
  },

  async isRegistered(eventId: string): Promise<boolean> {
    const user = authService.getCurrentUser();
    if (!user) return false;

    if (!isDemoMode()) {
      try {
        const regs = await this.getMyRegistrations();
        return regs.some((r) => r.eventId === eventId && r.status === 'confirmed');
      } catch {
        return false;
      }
    }

    const all = getStoredRegistrations();
    return all.some((r) => r.eventId === eventId && r.userId === user.id && r.status === 'confirmed');
  },

  // The attendee's live registration for an event: the newest pending or
  // confirmed one (so the event page can show "payment pending" as well
  // as "you're registered"), else the newest rejected one (so the page
  // can offer another attempt), else null.
  async getRegistrationForEvent(eventId: string): Promise<AttendeeRegistration | null> {
    const user = authService.getCurrentUser();
    if (!user) return null;

    const mine = (await this.getMyRegistrations()).filter((r) => r.eventId === eventId);
    const active = mine.find((r) => r.status === 'pending' || r.status === 'confirmed');
    if (active) return active;
    return mine.find((r) => r.status === 'rejected') || null;
  },

  // Free events only: instant confirmed pass. Paid events must go through
  // registerWithPayment — a paid event must never get an instant pass.
  async register(event: EventItem): Promise<AttendeeRegistration> {
    const user = authService.getCurrentUser();
    if (!user) {
      throw new Error('Please sign in or select a demo user profile to register for events.');
    }
    if (event.price > 0) {
      throw new Error('This is a paid event. Please pay and submit your payment for organizer approval.');
    }

    await new Promise((resolve) => setTimeout(resolve, 250));

    // Capacity verification
    if (event.registeredCount >= event.capacity) {
      throw new Error('This event is at full capacity. Join the waitlist or explore nearby alternatives.');
    }

    const all = getStoredRegistrations();
    const existing = all.find((r) => r.eventId === event.id && r.userId === user.id);

    if (existing && existing.status === 'confirmed') {
      return existing;
    }

    const newReg: AttendeeRegistration = {
      id: `reg-${Date.now()}`,
      eventId: event.id,
      event,
      userId: user.id,
      userName: user.name,
      userEmail: user.email,
      // Saved by the details gate before registration; shared with the
      // organizer only, for events that require attendee details.
      userPhone: user.phone || undefined,
      // Snapshot of the profile's verified flag. The server re-checks
      // this against the verification rows before storing (see
      // api/registrations.ts), so a client-sent value is never trusted.
      phoneVerified: user.phoneVerified || undefined,
      status: 'confirmed',
      registeredAt: new Date().toISOString(),
      ticketCode: newTicketCode(),
      checkedIn: false,
    };

    if (existing) {
      existing.status = 'confirmed';
      existing.ticketCode = newReg.ticketCode;
      existing.userPhone = newReg.userPhone || existing.userPhone;
      existing.phoneVerified = newReg.phoneVerified || existing.phoneVerified;
    } else {
      all.unshift(newReg);
    }
    saveStoredRegistrations(all);

    // Shared copy first (best effort); the local copy above is the
    // fallback when the shared table is not set up yet.
    if (!isDemoMode()) {
      try {
        await apiClient.post('/registrations', existing || newReg);
      } catch (err) {
        console.warn('Shared registration unavailable, keeping local registration:', err);
      }
    }

    // Update event registered count (system count bump, not a user edit,
    // so it does not go through the ownership check).
    try {
      await eventsService.adjustRegisteredCount(
        event.id,
        Math.min(event.capacity, event.registeredCount + 1),
      );
    } catch (e) {
      console.warn('Could not increment event registered count:', e);
    }

    return existing || newReg;
  },

  // Paid events: the attendee pays the organizer directly (UPI) and
  // submits the 12-digit UTR. This creates a PENDING registration that
  // holds NO spot while the organizer decides — a request that ends in
  // rejection must never have blocked a seat. The slot is taken only
  // on approval (approveRegistration, capacity-guarded). Pending rows
  // created before this change predate holdsSpot and are treated as
  // holding a spot (see AttendeeRegistration.holdsSpot).
  async registerWithPayment(event: EventItem, utr: string): Promise<AttendeeRegistration> {
    const user = authService.getCurrentUser();
    if (!user) {
      throw new Error('Please sign in or select a demo user profile to register for events.');
    }
    const cleanUtr = (utr || '').replace(/\s+/g, '');
    if (!/^\d{12}$/.test(cleanUtr)) {
      throw new Error('Enter the 12-digit UTR from your UPI payment.');
    }
    if (event.registeredCount >= event.capacity) {
      throw new Error('This event is at full capacity. Join the waitlist or explore nearby alternatives.');
    }

    const all = getStoredRegistrations();
    const existing = all.find((r) => r.eventId === event.id && r.userId === user.id);
    if (existing && (existing.status === 'confirmed' || existing.status === 'pending')) {
      return existing;
    }

    const newReg: AttendeeRegistration = {
      id: `reg-${Date.now()}`,
      eventId: event.id,
      event,
      userId: user.id,
      userName: user.name,
      userEmail: user.email,
      // Saved by the details gate before registration; shared with the
      // organizer only, for events that require attendee details.
      userPhone: user.phone || undefined,
      // Snapshot of the profile's verified flag; the server re-checks
      // it against the verification rows before storing.
      phoneVerified: user.phoneVerified || undefined,
      // No slot held while the organizer decides (see holdsSpot).
      holdsSpot: false,
      status: 'pending',
      registeredAt: new Date().toISOString(),
      ticketCode: '',
      checkedIn: false,
      utr: cleanUtr,
    };

    all.unshift(newReg);
    saveStoredRegistrations(all);

    if (!isDemoMode()) {
      try {
        await apiClient.post('/registrations', newReg);
      } catch (err) {
        console.warn('Shared registration unavailable, keeping local pending registration:', err);
      }
    }

    // No count change: a pending payment holds no spot. The slot is
    // taken only if the organizer approves (approveRegistration).

    return newReg;
  },

  async cancelRegistration(registrationId: string): Promise<boolean> {
    // Load the record (shared first, local fallback) so a pass bought on
    // another device can be cancelled from here too.
    let target: AttendeeRegistration | undefined;
    if (!isDemoMode()) {
      try {
        target = await apiClient.get<AttendeeRegistration>('/registrations', { id: registrationId });
      } catch {
        target = undefined;
      }
    }
    const all = getStoredRegistrations();
    const localTarget = all.find((r) => r.id === registrationId);
    const record = target || localTarget;
    if (!record) return false;
    if (record.status === 'cancelled') return true;

    // Only a held slot is released: confirmed passes always hold one;
    // pending payments hold one only if they predate the holdsSpot flag
    // (legacy rows). New pending payments hold nothing, so cancelling
    // one changes no count.
    const heldSpot =
      record.status === 'confirmed' ||
      (record.status === 'pending' && record.holdsSpot !== false);
    const user = authService.getCurrentUser();

    if (!isDemoMode()) {
      try {
        await apiClient.patch('/registrations', { status: 'cancelled' }, { id: registrationId });
      } catch (err) {
        console.warn('Shared cancellation unavailable, cancelling locally:', err);
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 200));
    if (localTarget) {
      localTarget.status = 'cancelled';
      saveStoredRegistrations(all);
    }

    if (heldSpot) {
      try {
        const event = await eventsService.getEventById(record.eventId);
        if (event && event.registeredCount > 0) {
          await eventsService.adjustRegisteredCount(
            record.eventId,
            event.registeredCount - 1,
          );
        }
      } catch (e) {
        console.warn('Could not decrement event count:', e);
      }
    }

    return true;
  },

  async getEventAttendees(eventId: string): Promise<AttendeeRegistration[]> {
    const local = getStoredRegistrations().filter((r) => r.eventId === eventId);
    if (isDemoMode()) return local;
    try {
      const shared = await apiClient.get<AttendeeRegistration[]>('/registrations', { eventId });
      return mergeRegistrations(Array.isArray(shared) ? shared : [], local);
    } catch (err) {
      console.warn('Shared attendees unavailable, falling back to local registrations:', err);
      await new Promise((resolve) => setTimeout(resolve, 150));
      return local;
    }
  },

  async toggleCheckIn(registrationId: string, approverEmail?: string): Promise<AttendeeRegistration> {
    const all = getStoredRegistrations();
    const localTarget = all.find((r) => r.id === registrationId);
    let current = localTarget?.checkedIn;
    if (!isDemoMode()) {
      try {
        const shared = await apiClient.get<AttendeeRegistration>('/registrations', { id: registrationId });
        if (shared) current = shared.checkedIn;
        const updated = await apiClient.patch<AttendeeRegistration>(
          '/registrations',
          { checkedIn: !current },
          { id: registrationId },
        );
        if (localTarget) {
          localTarget.checkedIn = updated.checkedIn;
          saveStoredRegistrations(all);
        }
        return updated;
      } catch (err) {
        console.warn('Shared check-in unavailable, toggling locally:', err);
      }
    }

    if (!localTarget) throw new Error('Registration record not found');
    localTarget.checkedIn = !localTarget.checkedIn;
    saveStoredRegistrations(all);
    return localTarget;
  },

  // Organizer approves a pending payment: the pass is issued now (the
  // ticket code is generated here, not at payment time). Slot rule: a
  // pending payment that holds no spot (holdsSpot: false, i.e. all new
  // ones) takes a slot on approval, so approval is refused when the
  // event is already full. A legacy pending payment already holds its
  // slot, so approving it changes no count.
  async approveRegistration(registrationId: string, approverEmail: string): Promise<AttendeeRegistration> {
    const ticketCode = newTicketCode();
    // Load the record first: approval needs to know whether this
    // registration holds a spot before it can check capacity.
    let record: AttendeeRegistration | undefined;
    if (!isDemoMode()) {
      try {
        record = await apiClient.get<AttendeeRegistration>('/registrations', { id: registrationId });
      } catch {
        record = undefined;
      }
    }
    if (!record) {
      const all = getStoredRegistrations();
      record = all.find((r) => r.id === registrationId);
    }
    const needsSpot = record?.holdsSpot === false;
    let event: EventItem | null = null;
    if (needsSpot && record) {
      try {
        event = await eventsService.getEventById(record.eventId);
      } catch {
        event = null;
      }
      if (event && event.registeredCount >= event.capacity) {
        throw new Error('This event is at full capacity. Free a spot (a cancellation or rejection) before approving.');
      }
    }
    if (!isDemoMode()) {
      try {
        const updated = await apiClient.patch<AttendeeRegistration>(
          '/registrations',
          { status: 'confirmed' },
          { id: registrationId },
        );
        const all = getStoredRegistrations();
        const localTarget = all.find((r) => r.id === registrationId);
        if (localTarget) {
          localTarget.status = 'confirmed';
          localTarget.ticketCode = ticketCode;
          saveStoredRegistrations(all);
        }
        if (needsSpot && event) {
          try {
            await eventsService.adjustRegisteredCount(
              event.id,
              Math.min(event.capacity, event.registeredCount + 1),
            );
          } catch (e) {
            console.warn('Could not increment event registered count:', e);
          }
        }
        return updated;
      } catch (err) {
        // A deliberate refusal (full event, or not the event's owner)
        // is a decision, not an outage: surface it instead of falling
        // back to a local approval that would bypass it.
        if (err instanceof ApiError && (err.status === 409 || err.status === 403)) {
          throw err;
        }
        console.warn('Shared approval unavailable, approving locally:', err);
      }
    }
    const all = getStoredRegistrations();
    const target = all.find((r) => r.id === registrationId);
    if (!target) throw new Error('Registration record not found');
    target.status = 'confirmed';
    target.ticketCode = ticketCode;
    saveStoredRegistrations(all);
    if (target.holdsSpot === false) {
      try {
        const ev = await eventsService.getEventById(target.eventId);
        if (ev && ev.registeredCount < ev.capacity) {
          await eventsService.adjustRegisteredCount(ev.id, ev.registeredCount + 1);
        }
      } catch (e) {
        console.warn('Could not increment event registered count:', e);
      }
    }
    return target;
  },

  // Organizer rejects a pending payment: a legacy held spot is
  // released; new pending payments held none, so rejecting one changes
  // no count.
  async rejectRegistration(registrationId: string, approverEmail: string): Promise<AttendeeRegistration> {
    if (!isDemoMode()) {
      try {
        const updated = await apiClient.patch<AttendeeRegistration>(
          '/registrations',
          { status: 'rejected' },
          { id: registrationId },
        );
        const all = getStoredRegistrations();
        const localTarget = all.find((r) => r.id === registrationId);
        if (localTarget) {
          localTarget.status = 'rejected';
          saveStoredRegistrations(all);
        }
        if (updated.holdsSpot !== false) await this.releaseSpot(updated.eventId);
        return updated;
      } catch (err) {
        // A deliberate refusal (not the event's owner) is a decision,
        // not an outage: surface it instead of rejecting locally.
        if (err instanceof ApiError && err.status === 403) {
          throw err;
        }
        console.warn('Shared rejection unavailable, rejecting locally:', err);
      }
    }
    const all = getStoredRegistrations();
    const target = all.find((r) => r.id === registrationId);
    if (!target) throw new Error('Registration record not found');
    target.status = 'rejected';
    saveStoredRegistrations(all);
    if (target.holdsSpot !== false) await this.releaseSpot(target.eventId);
    return target;
  },

  // Release one held spot (legacy pending payments only; new pending
  // payments never held one).
  async releaseSpot(eventId: string): Promise<void> {
    try {
      const event = await eventsService.getEventById(eventId);
      if (event && event.registeredCount > 0) {
        await eventsService.adjustRegisteredCount(eventId, event.registeredCount - 1);
      }
    } catch (e) {
      console.warn('Could not release event spot:', e);
    }
  },

  // Pending-payment counts per event, for the organizer list badge.
  // Empty when the shared table is not set up (local pending payments
  // are same-browser only, so they are not counted here).
  async getPendingCounts(): Promise<Record<string, number>> {
    if (isDemoMode()) return {};
    try {
      const res = await apiClient.get<{ counts: Record<string, number> }>('/registrations', {
        pendingCounts: '1',
      });
      return res?.counts || {};
    } catch {
      return {};
    }
  },
};
