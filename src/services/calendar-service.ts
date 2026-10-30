import { apiClient } from './api-client';

export interface CalendarStatus {
  connected: boolean;
  google_email: string | null;
}

export interface CalendarAddResult {
  connected: boolean;
  revoked?: boolean;
  calendarEventId?: string;
  htmlLink?: string | null;
  message?: string;
}

// Which Google Calendar event Locora created for each Locora event, kept
// in this browser only. The server never needs this mapping: it inserts
// by event id and deletes by the Google event id the browser hands back.
const MAPPING_KEY = 'locora_calendar_event_ids';

function readMapping(): Record<string, string> {
  try {
    const parsed = JSON.parse(localStorage.getItem(MAPPING_KEY) || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export const calendarService = {
  async getStatus(userId: string): Promise<CalendarStatus> {
    try {
      return await apiClient.get<CalendarStatus>('/calendar/status', { userId });
    } catch {
      return { connected: false, google_email: null };
    }
  },

  // Full-page redirect to Google's consent screen. After consent the
  // callback sends the user back to `returnTo` (same-site paths only).
  connectCalendar(userId: string, returnTo = '/profile'): void {
    const url =
      `/api/auth/google-calendar?userId=${encodeURIComponent(userId)}` +
      `&returnTo=${encodeURIComponent(returnTo)}`;
    window.location.href = url;
  },

  async disconnectCalendar(userId: string): Promise<boolean> {
    try {
      await apiClient.delete('/calendar/status', { userId });
      return true;
    } catch {
      return false;
    }
  },

  async addEventToCalendar(userId: string, eventId: string): Promise<CalendarAddResult> {
    return apiClient.post<CalendarAddResult>('/calendar/events', { userId, eventId });
  },

  async removeEventFromCalendar(userId: string, calendarEventId: string): Promise<boolean> {
    try {
      await apiClient.delete('/calendar/events', { userId, calendarEventId });
      return true;
    } catch {
      return false;
    }
  },

  getCalendarEventId(eventId: string): string | null {
    return readMapping()[eventId] || null;
  },

  setCalendarEventId(eventId: string, calendarEventId: string): void {
    try {
      const mapping = readMapping();
      mapping[eventId] = calendarEventId;
      localStorage.setItem(MAPPING_KEY, JSON.stringify(mapping));
    } catch {
      // Optional bookkeeping only; the calendar event itself is already created.
    }
  },

  clearCalendarEventId(eventId: string): void {
    try {
      const mapping = readMapping();
      delete mapping[eventId];
      localStorage.setItem(MAPPING_KEY, JSON.stringify(mapping));
    } catch {
      // Ignore.
    }
  },
};
