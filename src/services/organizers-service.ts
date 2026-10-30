import { EventItem, Organizer } from '../types';
import { DEMO_ORGANIZERS } from '../mocks/demo-data';
import { eventsService } from './events-service';
import { isDemoMode, apiClient } from './api-client';

export interface OrganizerStats {
  totalEvents: number;
  publishedCount: number;
  totalRegistrations: number;
  activeCommunities: number;
}

export const organizersService = {
  async getOrganizerById(id: string): Promise<Organizer | null> {
    if (!isDemoMode()) {
      try {
        const org = await apiClient.get<Organizer>(`/organizers/${id}`);
        if (org) return org;
      } catch {
        // No /api/organizers function exists in production, so a lookup
        // that stopped here returned null for EVERY organizer and the
        // profile page always showed "Organizer Not Found". Fall through
        // to deriving the organizer from the shared event list instead.
      }
      const { data: all } = await eventsService.getEvents({}, 1, 100);
      const match = all.find(
        (e) => e.organizer?.id === id || e.organizer?.slug === id,
      );
      if (!match) return null;
      const org = match.organizer;
      // Real organizers created through the app carry zeroed counts in
      // their record; fill them from their actual events. Records that
      // already carry counts (e.g. demo organizers) are left untouched.
      const mine = all.filter((e) =>
        org.email
          ? e.organizer?.email === org.email
          : e.organizer?.id === org.id,
      );
      return {
        ...org,
        eventsCount: org.eventsCount || mine.length,
        totalAttendeesServed:
          org.totalAttendeesServed ||
          mine.reduce((sum, e) => sum + (e.registeredCount || 0), 0),
      };
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
    return DEMO_ORGANIZERS.find((o) => o.id === id || o.slug === id) || null;
  },

  async getOrganizerEvents(organizerId: string): Promise<EventItem[]> {
    if (!isDemoMode()) {
      try {
        return await apiClient.get<EventItem[]>(`/organizers/${organizerId}/events`);
      } catch {
        // Same missing endpoint as above; fall through to the event list.
      }
    }

    const { data: all } = await eventsService.getEvents({}, 1, 100);
    // Group by email as well as id/slug: an organizer's record id can
    // differ between events (e.g. a re-attributed older event vs events
    // they create now), but their email stays the same.
    const org = await this.getOrganizerById(organizerId).catch(() => null);
    return all.filter(
      (e) =>
        e.organizer?.id === organizerId ||
        e.organizer?.slug === organizerId ||
        (org?.email ? e.organizer?.email === org.email : false),
    );
  },

  async getOrganizerStats(organizerId: string): Promise<OrganizerStats> {
    const events = await this.getOrganizerEvents(organizerId);
    const published = events.filter((e) => e.status === 'published');
    const totalRegs = events.reduce((sum, e) => sum + (e.registeredCount || 0), 0);

    return {
      totalEvents: events.length,
      publishedCount: published.length,
      totalRegistrations: totalRegs,
      activeCommunities: 1,
    };
  },
};
