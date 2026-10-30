import { EventItem, Organizer, UserProfile, EventCategory } from '../types';

// Cover images live in src/assets/images. They must be imported so Vite
// bundles them into dist/ for production. A plain src/ URL
// string only works in Vite dev (via vite.middlewares) and 404s in a
// production build, which is why the cards showed broken images.
import heroGatheringImg from '../assets/images/hero_neighborhood_gathering_1792850960020.jpg';
import techHackathonImg from '../assets/images/event_tech_hackathon_1792850960780.jpg';
import farmersMarketImg from '../assets/images/event_farmers_market_1792850961672.jpg';
import acousticMusicImg from '../assets/images/event_acoustic_music_1792850962324.jpg';
import morningYogaImg from '../assets/images/event_morning_yoga_1792850962615.jpg';

export const DEMO_ORGANIZERS: Organizer[] = [
  {
    id: 'org-1',
    name: 'Metro Civic Tech Collective',
    slug: 'metro-civic-tech',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
    bio: 'Fostering grassroots civic innovation, open data workshops, and ethical technology hackathons for our urban community.',
    website: 'https://civictech.demo',
    email: 'organizers@civictech.demo',
    location: 'Downtown Arts District',
    eventsCount: 14,
    totalAttendeesServed: 1240,
  },
  {
    id: 'org-2',
    name: 'Green Roots Urban Agriculture',
    slug: 'green-roots-urban-ag',
    avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150&auto=format&fit=crop&q=80',
    bio: 'Connecting local growers, artisan bakers, and urban gardeners. We run neighborhood markets and zero-waste workshops.',
    website: 'https://greenroots.demo',
    email: 'hello@greenroots.demo',
    location: 'Silverlake Commons',
    eventsCount: 28,
    totalAttendeesServed: 3450,
  },
  {
    id: 'org-3',
    name: 'Courtyard Sessions Live',
    slug: 'courtyard-sessions-live',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
    bio: 'Independent live acoustic performances, indie songwriter showcases, and intimate musical evenings in neighborhood gardens.',
    website: 'https://courtyardsessions.demo',
    email: 'booking@courtyardsessions.demo',
    location: 'Historic Old Town',
    eventsCount: 19,
    totalAttendeesServed: 1820,
  },
  {
    id: 'org-4',
    name: 'City Parks Wellness Initiative',
    slug: 'city-parks-wellness',
    avatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150&auto=format&fit=crop&q=80',
    bio: 'Promoting free and accessible community yoga, trail running clubs, and outdoor mindfulness across municipal parks.',
    website: 'https://citywellness.demo',
    email: 'info@citywellness.demo',
    location: 'Waterfront Green',
    eventsCount: 32,
    totalAttendeesServed: 4200,
  },
  {
    id: 'org-5',
    name: 'Artisans & Makers Guild',
    slug: 'artisans-makers-guild',
    avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80',
    bio: 'Supporting local ceramicists, screenprinters, woodworkers, and craftspeople with open studio tours and hands-on skill-shares.',
    website: 'https://makersguild.demo',
    email: 'contact@makersguild.demo',
    location: 'Innovation Quarter',
    eventsCount: 22,
    totalAttendeesServed: 1950,
  },
];

export const DEMO_EVENTS: EventItem[] = [];

// Sample events were removed: the event list starts empty and only
// shows events that users actually create.

export const DEMO_NEIGHBORHOODS = [
  'All Neighborhoods',
  'Downtown Arts District',
  'Silverlake Commons',
  'Historic Old Town',
  'Waterfront Green',
  'Innovation Quarter',
];

export const DEMO_CATEGORIES: EventCategory[] = [
  'Technology & Hackathons',
  'Workshops & Learning',
  'Live Music & Culture',
  'Fitness & Outdoors',
  'Food & Community',
  'Art & Creative',
  'Volunteering & Impact',
];

export const DEFAULT_DEMO_USER: UserProfile = {
  id: 'usr-attendee-1',
  name: 'Sarah Chen',
  email: 'sarah.chen@example.com',
  avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80',
  bio: 'Product designer & urban gardener passionate about neighborhood sustainability and local live music.',
  neighborhood: 'Silverlake Commons',
  interests: ['Food & Community', 'Live Music & Culture', 'Technology & Hackathons', 'Fitness & Outdoors'],
  role: 'attendee',
  createdAt: '2026-01-15T08:00:00Z',
};

export const DEFAULT_DEMO_ORGANIZER_USER: UserProfile = {
  id: 'usr-org-1',
  name: 'Marcus Vance',
  email: 'marcus@civictech.demo',
  avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
  bio: 'Organizer lead at Metro Civic Tech Collective. Building bridges between local technology innovators and neighborhood communities.',
  neighborhood: 'Downtown Arts District',
  interests: ['Technology & Hackathons', 'Workshops & Learning', 'Volunteering & Impact'],
  role: 'organizer',
  createdAt: '2025-10-10T11:00:00Z',
};
