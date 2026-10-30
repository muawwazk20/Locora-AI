/**
 * Locora Core Types and Domain Models
 * Defines data structures for events, attendees, organizers, and API contracts.
 */

export type EventCategory =
  | 'Technology & Hackathons'
  | 'Workshops & Learning'
  | 'Live Music & Culture'
  | 'Fitness & Outdoors'
  | 'Food & Community'
  | 'Art & Creative'
  | 'Volunteering & Impact';

export type EventStatus = 'published' | 'draft' | 'cancelled' | 'completed';

export type RegistrationStatus = 'confirmed' | 'waitlist' | 'cancelled' | 'pending' | 'rejected';

export interface Organizer {
  id: string;
  name: string;
  slug: string;
  avatar: string;
  bio: string;
  website?: string;
  email: string;
  location: string;
  eventsCount: number;
  totalAttendeesServed: number;
}

export interface EventItem {
  id: string;
  title: string;
  slug: string;
  description: string;
  summary: string;
  category: EventCategory;
  coverImage: string;
  startDate: string; // ISO String (e.g. '2026-11-14T18:30:00Z')
  endDate: string;   // ISO String
  venueName: string;
  address: string;
  // Legacy stored value, kept for old records. Never displayed or
  // filtered on: the neighborhood is derived — the city when a state is
  // selected, otherwise none (see getEventNeighborhood in formatters).
  neighborhood: string;
  city: string;
  // Worldwide location, set by the Country -> State -> City picker on the
  // create page. Older events predate this and may not carry them.
  state?: string;
  country?: string;
  // Ownership key: the creator's email, stamped at creation. Only this
  // user (or an admin) may edit or delete the event. Older events predate
  // this field and fall back to their organizer's email for ownership.
  createdByEmail?: string;
  price: number; // 0 for free
  // Organizer's UPI ID for manual-approval payments on paid events
  // (shown to attendees at registration). Optional: without it, attendees
  // are told to pay the organizer directly and submit their UTR.
  upiId?: string;
  // Attendee details gate: when true (or absent — older events predate
  // this flag), registering requires the attendee's name, mobile number
  // and email, plus a per-registration confirmation that those details
  // are shared with the organizer only. When false, registration needs
  // no details at all. Set on the create/edit forms.
  requireAttendeeDetails?: boolean;
  capacity: number;
  registeredCount: number;
  status: EventStatus;
  organizer: Organizer;
  tags: string[];
  isFeatured?: boolean;
  ageRestriction?: string;
}

export interface AttendeeRegistration {
  id: string;
  eventId: string;
  event: EventItem;
  userId: string;
  userName: string;
  userEmail: string;
  status: RegistrationStatus;
  registeredAt: string;
  ticketCode: string;
  checkedIn: boolean;
  // Manual-approval payments: the 12-digit UPI reference the attendee
  // submitted with a paid registration. Empty until approval, when the
  // ticket code is issued. Only present on paid registrations.
  utr?: string;
  // Attendee contact details, shared with the organizer only, for
  // events that require them (see EventItem.requireAttendeeDetails).
  // Only present on registrations made after the details gate.
  userPhone?: string;
  // True when the server confirmed, at registration time, that a
  // Telegram-verified row matches this registration's email + phone
  // (api/registrations.ts). A client-sent value is never trusted: the
  // server overwrites it from the verification rows.
  phoneVerified?: boolean;
  // Slot accounting: pending registrations created BEFORE this flag
  // existed held a spot (registeredCount +1 at payment time). Those
  // rows predate the flag and are treated as holding one. New pending
  // registrations set holdsSpot: false: they hold NO slot while the
  // organizer decides, so a rejected request never blocked a spot.
  // Approval of a holdsSpot: false registration takes a slot (+1),
  // guarded by capacity; approval of a legacy one does not.
  holdsSpot?: boolean;
}

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  // Mobile number, collected once via the attendee details gate before
  // the first registration for an event that requires details, then
  // reused (with a per-registration sharing confirmation). Never
  // displayed publicly; shared with the event organizer only.
  phone?: string;
  // Free Telegram verification (see api/telegram-verify.ts): true once
  // the user shared, via the bot, a Telegram-verified number matching
  // this profile number. Changing the number resets it to false.
  // Note: this flag itself is set from the browser after polling, so
  // in this app's session model it is a display flag; the registration
  // badge is the server-attested one (api/registrations.ts checks the
  // verification rows before stamping it).
  phoneVerified?: boolean;
  avatar: string;
  bio: string;
  // Legacy: the home-neighborhood field is retired. Home location is
  // country/state/city; the neighborhood, where needed, is the city
  // when a state is selected, otherwise none.
  neighborhood: string;
  // Home location from the Country -> State -> City picker on Profile.
  country?: string;
  state?: string;
  city?: string;
  interests: EventCategory[];
  role: 'attendee' | 'organizer' | 'admin';
  // How this account's email was verified: 'google' for Google sign-in
  // (email verified by Google), 'local' for the local password fallback.
  // Admin status is only trusted for Google-signed-in accounts.
  authProvider?: 'google' | 'local';
  createdAt: string;
}

export interface SmartMatchResult {
  event: EventItem;
  score: number; // 0 - 100
  matchReasons: string[];
}

export interface EventFilterOptions {
  query?: string;
  category?: string;
  // Worldwide location filter (Country -> State -> City, from Discover).
  country?: string;
  state?: string;
  city?: string;
  dateRange?: 'all' | 'today' | 'tomorrow' | 'this_weekend' | 'this_month' | 'custom';
  // Custom calendar range (Discover date picker). Only meaningful when
  // dateRange is 'custom'; both are local calendar dates (YYYY-MM-DD).
  // Empty means no custom range.
  startDate?: string;
  endDate?: string;
  priceType?: 'all' | 'free' | 'paid';
  sortBy?: 'soonest' | 'relevance' | 'capacity';
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
  error?: string;
}

