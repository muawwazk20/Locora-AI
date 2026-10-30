import { EventItem } from '../types';
import { DEMO_EVENTS } from '../mocks/demo-data';
import { eventsService } from './events-service';
import { isDemoMode, apiClient } from './api-client';

const SAVED_STORAGE_KEY = 'locora_saved_events';

function getInitialSaved(): string[] {
  // No sample saved events: sample events (evt-1..evt-8) were removed.
  return [];
}

function getStoredSavedIds(): string[] {
  try {
    const raw = localStorage.getItem(SAVED_STORAGE_KEY);
    if (!raw) {
      const initial = getInitialSaved();
      localStorage.setItem(SAVED_STORAGE_KEY, JSON.stringify(initial));
      return initial;
    }
    const parsed = JSON.parse(raw);
    // Drop saved ids for removed sample events (evt-1..evt-8).
    const sampleIds = new Set(['evt-1', 'evt-2', 'evt-3', 'evt-4', 'evt-5', 'evt-6', 'evt-7', 'evt-8']);
    const filtered = Array.isArray(parsed) ? parsed.filter((id: string) => !sampleIds.has(id)) : parsed;
    if (Array.isArray(parsed) && filtered.length !== parsed.length) {
      try { localStorage.setItem(SAVED_STORAGE_KEY, JSON.stringify(filtered)); } catch { /* keep filtered list in memory */ }
    }
    return filtered;
  } catch {
    return getInitialSaved();
  }
}

function saveStoredIds(ids: string[]): void {
  try {
    localStorage.setItem(SAVED_STORAGE_KEY, JSON.stringify(ids));
  } catch (err) {
    console.error('Failed to update saved event IDs:', err);
  }
}

type SavedListener = (ids: string[]) => void;
const listeners = new Set<SavedListener>();

function notify(ids: string[]) {
  listeners.forEach((fn) => fn(ids));
}

export const savedEventsService = {
  subscribe(listener: SavedListener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  getSavedIds(): string[] {
    return getStoredSavedIds();
  },

  isSaved(eventId: string): boolean {
    const ids = getStoredSavedIds();
    return ids.includes(eventId);
  },

  async toggleSave(eventId: string): Promise<boolean> {
    if (!isDemoMode()) {
      try {
        const isCurrentlySaved = this.isSaved(eventId);
        if (isCurrentlySaved) {
          await apiClient.delete(`/me/saved-events/${eventId}`);
          return false;
        } else {
          await apiClient.post(`/me/saved-events/${eventId}`);
          return true;
        }
      } catch (err) {
        console.warn('Backend API saved-events unavailable, falling back to local saved events:', err);
      }
    }

    const ids = getStoredSavedIds();
    let updated: string[];
    let isNowSaved = false;

    if (ids.includes(eventId)) {
      updated = ids.filter((id) => id !== eventId);
      isNowSaved = false;
    } else {
      updated = [...ids, eventId];
      isNowSaved = true;
    }

    saveStoredIds(updated);
    notify(updated);
    return isNowSaved;
  },

  async getSavedEvents(): Promise<EventItem[]> {
    if (!isDemoMode()) {
      try {
        return await apiClient.get<EventItem[]>('/me/saved-events');
      } catch (err) {
        console.warn('Backend API saved-events unavailable, falling back to local saved events:', err);
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 150));
    const ids = getStoredSavedIds();
    const result: EventItem[] = [];

    for (const id of ids) {
      const event = await eventsService.getEventById(id);
      if (event) {
        result.push(event);
      }
    }

    return result;
  },
};
