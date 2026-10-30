import { EventCategory, EventItem, SmartMatchResult } from '../types';
import { eventsService } from './events-service';
import { authService } from './auth-service';
import { isDemoMode, apiClient } from './api-client';
import { formatEventLocation, getEventNeighborhood } from '../utils/formatters';

export interface SmartMatchOptions {
  userInterests?: EventCategory[];
  // The user's home city (which, under the location rule, is their
  // neighborhood when a state is selected). No separate neighborhood
  // preference exists anymore.
  preferredCity?: string;
  preferFreeOnly?: boolean;
}

export const smartMatchService = {
  async getRecommendations(options?: SmartMatchOptions): Promise<SmartMatchResult[]> {
    if (!isDemoMode()) {
      return apiClient.get<SmartMatchResult[]>('/smart-match/recommendations', {
        interests: options?.userInterests?.join(','),
        city: options?.preferredCity,
        freeOnly: options?.preferFreeOnly,
      });
    }

    await new Promise((resolve) => setTimeout(resolve, 200));

    const user = authService.getCurrentUser();
    const interests = options?.userInterests || user?.interests || ['Food & Community', 'Live Music & Culture'];
    // Home city from the saved location: the city is the neighborhood
    // only when a state is selected, otherwise there is no target city.
    const homeCity = options?.preferredCity || (user?.state ? (user?.city || '') : '');
    const preferFree = options?.preferFreeOnly ?? false;

    const { data: events } = await eventsService.getEvents({}, 1, 50);

    const scored: SmartMatchResult[] = events.map((event: EventItem) => {
      let score = 30; // Baseline score
      const matchReasons: string[] = [];

      // Category / Interest Match (+35)
      if (interests.includes(event.category)) {
        score += 35;
        matchReasons.push(`Matches your interest in ${event.category}`);
      }

      // Tag Match (+15)
      const matchingTags = event.tags.filter((tag) =>
        interests.some((interest) => interest.toLowerCase().includes(tag.toLowerCase()))
      );
      if (matchingTags.length > 0) {
        score += 15;
        matchReasons.push(`Aligned tags: ${matchingTags.slice(0, 2).join(', ')}`);
      }

      // City Match (+20): the event's derived neighborhood (its city,
      // when it has a state) equals the user's home city.
      const eventNeighborhood = getEventNeighborhood(event);
      if (homeCity && eventNeighborhood && eventNeighborhood === homeCity) {
        score += 20;
        matchReasons.push(`In your city (${homeCity})`);
      } else {
        score += 5;
        const location = formatEventLocation(event);
        if (location) matchReasons.push(`Taking place in ${location}`);
      }

      // Price preference (+10)
      if (preferFree && event.price === 0) {
        score += 10;
        matchReasons.push('Free community admission');
      } else if (!preferFree && event.price === 0) {
        score += 5;
      }

      // High availability boost (+5)
      const remainingCapacity = event.capacity - event.registeredCount;
      if (remainingCapacity > 10) {
        score += 5;
        matchReasons.push('Good seating & registration availability');
      }

      // Cap at 98 for realistic presentation
      const finalScore = Math.min(98, score);

      return {
        event,
        score: finalScore,
        matchReasons,
      };
    });

    // Sort descending by deterministic score
    return scored.sort((a, b) => b.score - a.score);
  },
};
