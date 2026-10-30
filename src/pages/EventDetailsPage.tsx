import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  Calendar,
  Clock,
  MapPin,
  Users,
  Bookmark,
  Share2,
  ExternalLink,
  ArrowLeft,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Shield,
  Copy,
  Check,
  MessageCircle,
} from 'lucide-react';
import { EventItem, AttendeeRegistration } from '../types';
import QRCode from 'qrcode';
import { eventsService } from '../services/events-service';
import { registrationsService } from '../services/registrations-service';
import { savedEventsService } from '../services/saved-events-service';
import { authService } from '../services/auth-service';
import { AttendeeDetailsGate } from '../components/events/AttendeeDetailsGate';
import { formatEventDate, formatEventTimeRange, formatPrice, getMapsSearchUrl, formatEventLocation, getEventNeighborhood } from '../utils/formatters';
import { useToast } from '../components/ui/Toast';
import { ConfirmDialog, Modal } from '../components/ui/Modal';
import { EventDetailsSkeleton } from '../components/ui/LoadingSkeleton';
import { EventCard } from '../components/events/EventCard';

// "Add to Google Calendar" link. This uses Google Calendar's public template
// URL, which prefills an event in the visitor's own Google Calendar — no
// OAuth, no Locora connection, and no Google verification required, so it
// works for every visitor, including guests. This is now the only calendar
// action on the page: the OAuth connect button and its automatic add/remove
// code were removed.
function toGoogleTemplateDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

// SECURITY FIX — Phase 1 Finding 5: the calendar link no longer embeds
// the full event description (which once contained pasted AI-conversation
// text). It uses a plain-text summary only, HTML stripped, truncated to
// 200 characters, so a long or pasted description can never leak into an
// external Google Calendar URL.
function calendarSummary(event: EventItem): string {
  const raw = event.summary || event.description || '';
  const plain = raw.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  return plain.length > 200 ? plain.slice(0, 200).trimEnd() + '…' : plain;
}

function buildGoogleCalendarTemplateUrl(event: EventItem): string {
  const start = toGoogleTemplateDate(event.startDate);
  const end = event.endDate
    ? toGoogleTemplateDate(event.endDate)
    : toGoogleTemplateDate(
        new Date(new Date(event.startDate).getTime() + 2 * 60 * 60 * 1000).toISOString(),
      );
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title,
    dates: `${start}/${end}`,
    details: calendarSummary(event),
    location: [event.venueName, event.address, event.city].filter(Boolean).join(', '),
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export function EventDetailsPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [event, setEvent] = useState<EventItem | null>(null);
  const [relatedEvents, setRelatedEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSaved, setIsSaved] = useState(false);
  const [registration, setRegistration] = useState<AttendeeRegistration | null>(null);

  // Modals state
  const [confirmRegisterOpen, setConfirmRegisterOpen] = useState(false);
  const [confirmCancelOpen, setConfirmCancelOpen] = useState(false);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  // Attendee details gate state: which registration flow to continue
  // once the user has provided/confirmed their details.
  const [detailsGateOpen, setDetailsGateOpen] = useState(false);
  // Aggregate pending-approval count for the capacity block
  // (pending / approved / total). No attendee details, and a failure
  // here never blocks the event itself.
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    if (!eventId) return;
    registrationsService.getPendingCounts()
      .then((counts) => setPendingCount(counts[eventId] || 0))
      .catch(() => {});
  }, [eventId]);
  const [detailsGateTarget, setDetailsGateTarget] = useState<'free' | 'paid' | null>(null);
  // Manual-approval payment dialog state (paid events only).
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [utr, setUtr] = useState('');
  const [utrError, setUtrError] = useState('');
  const [copiedUpi, setCopiedUpi] = useState(false);
  const [upiQr, setUpiQr] = useState('');
  // SECURITY FIX (Finding 2): UPI is no longer in the public event
  // object. It is fetched, only when the paid checkout opens and only
  // for a signed-in user, from /events?payment=1. On failure there is
  // no fallback to a public UPI value — the dialog says unavailable.
  const [paymentUpiId, setPaymentUpiId] = useState<string | null>(null);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [paymentError, setPaymentError] = useState('');

  useEffect(() => {
    if (!paymentOpen || !event || event.price <= 0) return;
    let active = true;
    setPaymentLoading(true);
    setPaymentError('');
    setPaymentUpiId(null);
    eventsService.getEventPayment(event.id)
      .then((info) => { if (active) setPaymentUpiId(info.upiId || null); })
      .catch(() => { if (active) setPaymentError('Payment info is unavailable right now. Please try again, or pay the organizer directly and enter your UTR below.'); })
      .finally(() => { if (active) setPaymentLoading(false); });
    return () => { active = false; };
  }, [paymentOpen, event?.id]);

  // UPI deep link: tapping it opens the user's UPI app with the payee,
  // amount and note prefilled. The same string is encoded in the QR
  // code below, so desktop users can scan it with their phone.
  const upiUri = event && paymentUpiId
    ? `upi://pay?pa=${encodeURIComponent(paymentUpiId)}&pn=${encodeURIComponent(event.organizer?.name || 'Locora Organizer')}&am=${event.price}&cu=INR&tn=${encodeURIComponent((event.title || 'Event payment').slice(0, 60))}`
    : '';

  // Render the QR code client-side (no third-party QR service sees the
  // organizer's UPI ID or the amount). Themed to the site: Deep Forest
  // modules on white. Error correction 'H' (~30% recoverable) is what
  // lets the center logo overlay below stay scannable — it covers
  // under a quarter of the width, well inside what 'H' recovers.
  useEffect(() => {
    if (!upiUri) {
      setUpiQr('');
      return;
    }
    let active = true;
    QRCode.toDataURL(upiUri, {
      margin: 2,
      width: 440,
      errorCorrectionLevel: 'H',
      color: { dark: '#1E3F35', light: '#FFFFFF' },
    })
      .then((url) => {
        if (active) setUpiQr(url);
      })
      .catch(() => {
        if (active) setUpiQr('');
      });
    return () => {
      active = false;
    };
  }, [upiUri]);

  useEffect(() => {
    async function loadEventData() {
      if (!eventId) return;
      setLoading(true);
      try {
        // These three do not depend on each other, so run them together
        // instead of stacking three ~2s calls (the shared event cache
        // also dedupes the event fetch inside getRelatedEvents).
        const [data, reg, related] = await Promise.all([
          eventsService.getEventById(eventId),
          registrationsService.getRegistrationForEvent(eventId),
          eventsService.getRelatedEvents(eventId),
        ]);
        setEvent(data);
        if (data) {
          setIsSaved(savedEventsService.isSaved(data.id));
          setRegistration(reg);
          setRelatedEvents(related);
        }
      } catch (err) {
        console.error('Failed to load event details:', err);
      } finally {
        setLoading(false);
      }
    }
    loadEventData();
  }, [eventId]);

  if (loading) {
    return <EventDetailsSkeleton />;
  }

  if (!event) {
    return (
      <div className="max-w-lg mx-auto px-4 py-20 text-center space-y-4">
        <div className="w-12 h-12 bg-rose-50 text-rose-600 rounded-xl flex items-center justify-center mx-auto">
          <AlertCircle className="w-6 h-6" />
        </div>
        <h2 className="font-editorial text-2xl font-bold text-[#1E2320]">Event Not Found</h2>
        <p className="text-sm text-[#5F635D]">
          The event you are looking for may have been removed or does not exist.
        </p>
        <Link
          to="/discover"
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#1E3F35] text-white rounded-lg text-xs font-semibold hover:bg-[#163028] transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Discover</span>
        </Link>
      </div>
    );
  }

  const isFull = event.registeredCount >= event.capacity;
  const isRegistered = Boolean(registration && registration.status === 'confirmed');
  const isPaymentPending = Boolean(registration && registration.status === 'pending');
  const isPaymentRejected = Boolean(registration && registration.status === 'rejected');
  const isPaidEvent = event.price > 0;
  const spotsLeft = Math.max(0, event.capacity - event.registeredCount);

  const handleToggleBookmark = async () => {
    try {
      const state = await savedEventsService.toggleSave(event.id);
      setIsSaved(state);
      toast({
        type: 'success',
        title: state ? 'Event saved' : 'Removed from bookmarks',
      });
    } catch {
      toast({ type: 'error', title: 'Failed to bookmark event' });
    }
  };

  // Attendee details gate: events require attendee details unless the
  // organizer opted out (missing flag on older events means required).
  // Guests skip the gate — registration itself requires sign-in, and
  // the existing service error covers that path unchanged.
  const detailsRequired = event ? event.requireAttendeeDetails !== false : false;
  const openRegistration = (target: 'free' | 'paid') => {
    if (!detailsRequired || !authService.getCurrentUser()) {
      if (target === 'paid') setPaymentOpen(true);
      else setConfirmRegisterOpen(true);
      return;
    }
    setDetailsGateTarget(target);
    setDetailsGateOpen(true);
  };

  const handleRegisterConfirm = async () => {
    setActionLoading(true);
    try {
      const reg = await registrationsService.register(event);
      setRegistration(reg);
      setEvent((prev) => (prev ? { ...prev, registeredCount: prev.registeredCount + 1 } : null));
      setConfirmRegisterOpen(false);
      toast({
        type: 'success',
        title: 'Registration Confirmed!',
        description: `Your ticket code is ${reg.ticketCode}. View it anytime in My Registrations.`,
      });
    } catch (err: unknown) {
      toast({
        type: 'error',
        title: 'Registration failed',
        description: err instanceof Error ? err.message : 'Please try again.',
      });
    } finally {
      setActionLoading(false);
    }
  };

  const handlePaymentSubmit = async () => {
    const cleanUtr = utr.replace(/\s+/g, '');
    if (!/^\d{12}$/.test(cleanUtr)) {
      setUtrError('Enter the 12-digit UTR from your UPI payment.');
      return;
    }
    setUtrError('');
    setActionLoading(true);
    try {
      const reg = await registrationsService.registerWithPayment(event, cleanUtr);
      setRegistration(reg);
      // No count change: a pending payment holds no spot. The count
      // rises only if the organizer approves.
      setPaymentOpen(false);
      setUtr('');
      toast({
        type: 'success',
        title: 'Payment submitted',
        description: 'Your payment is awaiting organizer approval. Your pass will appear here once it is approved.',
      });
    } catch (err: unknown) {
      toast({
        type: 'error',
        title: 'Payment submission failed',
        description: err instanceof Error ? err.message : 'Please try again.',
      });
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancelConfirm = async () => {
    if (!registration) return;
    setActionLoading(true);
    try {
      await registrationsService.cancelRegistration(registration.id);
      // Only a held slot frees a count: confirmed passes always hold
      // one; pending payments hold one only if they predate holdsSpot.
      const heldSpot =
        registration.status === 'confirmed' ||
        (registration.status === 'pending' && registration.holdsSpot !== false);
      setRegistration(null);
      if (heldSpot) {
        setEvent((prev) => (prev ? { ...prev, registeredCount: Math.max(0, prev.registeredCount - 1) } : null));
      }
      setConfirmCancelOpen(false);
      toast({
        type: 'info',
        title: 'Registration Cancelled',
        description: heldSpot
          ? 'Your spot has been freed up for other community members.'
          : 'Your pending payment request has been withdrawn.',
      });
    } catch {
      toast({
        type: 'error',
        title: 'Cancellation failed',
      });
    } finally {
      setActionLoading(false);
    }
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-10">
      {/* Back Link */}
      <Link
        to="/discover"
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#5F635D] hover:text-[#1E2320] transition-colors"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        <span>Back to events</span>
      </Link>

      {/* Main Cover Banner */}
      <div className="relative rounded-2xl overflow-hidden aspect-[16/9] sm:aspect-[21/9] bg-[#1E2320] shadow-md border border-[#E5E1D8]">
        <img
          src={event.coverImage}
          alt={event.title}
          referrerPolicy="no-referrer"
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#1E2320]/80 via-transparent to-transparent" />

        {/* Floating Top Buttons */}
        <div className="absolute top-4 right-4 flex items-center gap-2">
          <button
            type="button"
            onClick={handleToggleBookmark}
            className="p-2.5 rounded-lg bg-white/95 hover:bg-white text-[#1E2320] hover:text-[#1E3F35] shadow-xs backdrop-blur-xs transition-colors"
            aria-label={isSaved ? 'Remove from saved' : 'Save event'}
          >
            <Bookmark className={`w-4 h-4 ${isSaved ? 'fill-[#1E3F35] text-[#1E3F35]' : ''}`} />
          </button>
          <button
            type="button"
            onClick={() => setShareModalOpen(true)}
            className="p-2.5 rounded-lg bg-white/95 hover:bg-white text-[#1E2320] hover:text-[#1E3F35] shadow-xs backdrop-blur-xs transition-colors"
            aria-label="Share event"
          >
            <Share2 className="w-4 h-4" />
          </button>
        </div>

        {/* Bottom Title Metadata Bar */}
        <div className="absolute bottom-4 left-4 right-4 text-white">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#A3D9C9] mb-1">
            <span>{event.category}</span>
            {formatEventLocation(event) && (
              <>
                <span aria-hidden="true">·</span>
                <span>{formatEventLocation(event)}</span>
              </>
            )}
          </div>
          <h1 className="font-editorial text-2xl sm:text-4xl font-bold tracking-tight text-white leading-tight">
            {event.title}
          </h1>
        </div>
      </div>

      {/* Split Grid: Details & Registration Card */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column (8 cols): Description & Details */}
        <div className="lg:col-span-8 space-y-8">
          {/* Quick Info Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-5 bg-white rounded-xl border border-[#E5E1D8]">
            <div className="flex items-start gap-3">
              <Calendar className="w-5 h-5 text-[#1E3F35] shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-[#1E2320]">Date</p>
                <p className="text-xs text-[#5F635D] mt-0.5">{formatEventDate(event.startDate)}</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Clock className="w-5 h-5 text-[#1E3F35] shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-[#1E2320]">Time</p>
                <p className="text-xs text-[#5F635D] mt-0.5">
                  {formatEventTimeRange(event.startDate, event.endDate)}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 sm:col-span-2 pt-2 border-t border-[#EBE7DF]">
              <MapPin className="w-5 h-5 text-[#1E3F35] shrink-0 mt-0.5" />
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-[#1E2320]">{event.venueName}</p>
                  <a
                    href={getMapsSearchUrl(event.address, event.city)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] font-medium text-[#1E3F35] hover:underline"
                  >
                    <span>View in Maps</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
                <p className="text-xs text-[#5F635D] mt-0.5">{event.address}</p>
              </div>
            </div>
          </div>

          {/* About Event Section */}
          <div className="space-y-4">
            <h2 className="font-editorial text-2xl font-bold text-[#1E2320]">About this event</h2>
            <div className="text-sm text-[#1E2320]/80 leading-relaxed space-y-3 whitespace-pre-line">
              {event.description}
            </div>
          </div>

          {/* Tags */}
          {event.tags && event.tags.length > 0 && (
            <div className="pt-4 border-t border-[#E5E1D8]">
              <h3 className="text-xs font-semibold text-[#8C887E] uppercase tracking-wider mb-2">
                Event Tags
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {event.tags.map((tag) => (
                  <span
                    key={tag}
                    className="px-2.5 py-1 text-xs text-[#5F635D] bg-[#F4F1EA] rounded-md border border-[#E2DFD8]"
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Organizer Info Card */}
          <div className="p-6 bg-white rounded-xl border border-[#E5E1D8] space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[#8C887E] uppercase tracking-wider">
                Posted by
              </span>
              <Link
                to={`/organizers/${event.organizer.slug || event.organizer.id}`}
                className="text-xs font-semibold text-[#1E3F35] hover:underline"
              >
                View full profile
              </Link>
            </div>

            <div className="flex items-center gap-4">
              {event.organizer.avatar ? (
                <img
                  src={event.organizer.avatar}
                  alt={event.organizer.name}
                  referrerPolicy="no-referrer"
                  className="w-12 h-12 rounded-full object-cover shrink-0 border border-[#E5E1D8]"
                />
              ) : (
                <div
                  aria-hidden="true"
                  className="w-12 h-12 rounded-full shrink-0 border border-[#E5E1D8] bg-[#1E3F35] text-white flex items-center justify-center font-editorial text-lg font-bold"
                >
                  {(event.organizer.name || '?').charAt(0).toUpperCase()}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <h3 className="font-editorial text-base font-bold text-[#1E2320] truncate">
                  {event.organizer.name}
                </h3>
                <p className="text-xs text-[#5F635D] mt-0.5 line-clamp-2">
                  {event.organizer.bio}
                </p>
              </div>
            </div>

            {/* Message the organizer: SECURITY FIX (P2-4) — the link
                is /messages?eventId=x&to=organizer, an opaque slug,
                never an email. Public events no longer carry the
                organiser email (Finding 2), so this page cannot know
                whether the viewer IS the organiser; the server blocks
                messaging yourself ("You cannot message yourself") if
                they try. Guests go to sign-in first, like the gated
                View Event button. */}
            {(() => {
              const viewerEmail = (authService.getCurrentUser()?.email || '').toLowerCase();
              return (
                <Link
                  to={
                    viewerEmail
                      ? `/messages?eventId=${event.id}&to=organizer`
                      : '/login'
                  }
                  className="flex items-center justify-center gap-2 w-full px-4 py-2.5 text-xs font-semibold text-[#1E3F35] bg-white hover:bg-[#F4F1EA] border border-[#1E3F35] rounded-lg transition-colors"
                >
                  <MessageCircle className="w-4 h-4" />
                  Message organizer
                </Link>
              );
            })()}
          </div>
        </div>

        {/* Right Column (4 cols): Registration Card & Status */}
        <div className="lg:col-span-4 space-y-6 lg:sticky lg:top-24">
          <div className="p-6 bg-white rounded-xl border border-[#E5E1D8] shadow-xs space-y-5">
            {/* Price & Admission */}
            <div className="flex items-baseline justify-between pb-4 border-b border-[#EBE7DF]">
              <div>
                <span className="font-editorial text-2xl font-bold text-[#1E2320] tabular-nums">
                  {formatPrice(event.price)}
                </span>
                {event.price === 0 && (
                  <span className="text-xs text-[#5F635D] ml-1.5">/ attendee</span>
                )}
              </div>
              <span className="text-xs text-[#5F635D]">
                {event.ageRestriction || 'All Ages'}
              </span>
            </div>

            {/* Capacity Progress Bar */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-[#5F635D] font-medium">Capacity</span>
                <span className="tabular-nums font-semibold text-[#1E2320]">
                  {event.registeredCount} / {event.capacity} registered
                </span>
              </div>
              <div className="w-full h-2 bg-[#F4F1EA] rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-300 ${
                    isFull ? 'bg-rose-500' : 'bg-[#1E3F35]'
                  }`}
                  style={{
                    width: `${Math.min(100, (event.registeredCount / event.capacity) * 100)}%`,
                  }}
                />
              </div>
              <p className="text-[11px] text-[#5F635D]">
                {isFull ? (
                  <span className="text-rose-600 font-medium">Event reached maximum capacity</span>
                ) : (
                  <span>{spotsLeft} open spots remaining</span>
                )}
              </p>
              {pendingCount > 0 && (
                <p className="text-[11px] text-[#8C887E]">
                  {pendingCount} pending approval — these do not hold a spot
                </p>
              )}
            </div>

            {/* Action State: Registered vs Not Registered */}
            {isRegistered ? (
              <div className="space-y-3 pt-2">
                <div className="p-3 bg-[#EAF1ED] border border-[#D0E2D9] rounded-lg flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-[#1E3F35] shrink-0 mt-0.5" />
                  <div className="text-xs text-[#1E3F35]">
                    <p className="font-semibold">You're registered!</p>
                    <p className="text-[11px] text-[#1E3F35]/80 mt-0.5">
                      Pass code: <span className="font-mono font-bold">{registration?.ticketCode}</span>
                    </p>
                  </div>
                </div>

                <div className="flex gap-2">
                  <Link
                    to="/my-registrations"
                    className="flex-1 text-center py-2.5 px-3 text-xs font-semibold text-white bg-[#1E3F35] hover:bg-[#163028] rounded-lg transition-colors"
                  >
                    View Ticket Pass
                  </Link>
                  <button
                    type="button"
                    onClick={() => setConfirmCancelOpen(true)}
                    className="py-2.5 px-3 text-xs font-medium text-rose-600 hover:bg-rose-50 border border-rose-200 rounded-lg transition-colors"
                  >
                    Cancel RSVP
                  </button>
                </div>

              </div>
            ) : isPaymentPending ? (
              <div className="space-y-3 pt-2">
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2.5">
                  <Clock className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                  <div className="text-xs text-amber-800">
                    <p className="font-semibold">Payment pending approval</p>
                    <p className="text-[11px] mt-0.5">
                      UTR {registration?.utr} submitted. The organizer will verify your payment and approve your pass — it will appear here once approved.
                    </p>
                  </div>
                </div>

                <div className="flex gap-2">
                  <Link
                    to="/my-registrations"
                    className="flex-1 text-center py-2.5 px-3 text-xs font-semibold text-white bg-[#1E3F35] hover:bg-[#163028] rounded-lg transition-colors"
                  >
                    View Registration
                  </Link>
                  <button
                    type="button"
                    onClick={() => setConfirmCancelOpen(true)}
                    className="py-2.5 px-3 text-xs font-medium text-rose-600 hover:bg-rose-50 border border-rose-200 rounded-lg transition-colors"
                  >
                    Withdraw Request
                  </button>
                </div>
              </div>
            ) : isPaymentRejected ? (
              <div className="space-y-3 pt-2">
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg flex items-start gap-2.5">
                  <XCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <div className="text-xs text-rose-700">
                    <p className="font-semibold">Payment not approved</p>
                    <p className="text-[11px] mt-0.5">
                      The organizer did not approve this payment. You can pay again and resubmit below.
                    </p>
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    type="button"
                    disabled={isFull}
                    onClick={() => openRegistration('paid')}
                    className={`w-full py-3 text-xs font-semibold text-white rounded-lg transition-colors shadow-xs ${
                      isFull
                        ? 'bg-slate-300 cursor-not-allowed'
                        : 'bg-[#1E3F35] hover:bg-[#163028] cursor-pointer'
                    }`}
                  >
                    {isFull ? 'Event Sold Out' : 'Pay & Register Again'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="pt-2">
                <button
                  type="button"
                  disabled={isFull}
                  onClick={() => openRegistration(isPaidEvent ? 'paid' : 'free')}
                  className={`w-full py-3 text-xs font-semibold text-white rounded-lg transition-colors shadow-xs ${
                    isFull
                      ? 'bg-slate-300 cursor-not-allowed'
                      : 'bg-[#1E3F35] hover:bg-[#163028] cursor-pointer'
                  }`}
                >
                  {isFull ? 'Event Sold Out' : isPaidEvent ? `Register · ${formatPrice(event.price)}` : 'Register for Event'}
                </button>
              </div>
            )}

            <div className="pt-2 space-y-1.5">
              <a
                href={buildGoogleCalendarTemplateUrl(event)}
                target="_blank"
                rel="noreferrer"
                className="w-full py-2.5 px-3 text-xs font-semibold text-[#1E3F35] bg-white border border-[#D0E2D9] hover:bg-[#FAF8F5] rounded-lg transition-colors flex items-center justify-center gap-1.5"
              >
                <Calendar className="w-3.5 h-3.5" />
                <span>Add to Google Calendar</span>
              </a>
              <p className="text-[11px] text-[#8C887E] text-center">
                Opens Google Calendar with this event prefilled — works for
                everyone, no connection needed.
              </p>
            </div>

            <div className="pt-2 text-center">
              <p className="text-[11px] text-[#8C887E]">
                {isPaidEvent
                  ? 'Payment verified by the organizer · Digital entry after approval'
                  : 'Instant confirmation · No booking fees · Digital entry'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Related Events Section */}
      {relatedEvents.length > 0 && (
        <section className="pt-12 border-t border-[#E5E1D8] space-y-6">
          <h2 className="font-editorial text-2xl font-bold tracking-tight text-[#1E2320]">
            {getEventNeighborhood(event)
              ? `More Events in ${getEventNeighborhood(event)} & ${event.category}`
              : `More Events in ${event.category}`}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {relatedEvents.map((rel) => (
              <EventCard key={rel.id} event={rel} />
            ))}
          </div>
        </section>
      )}

      {/* Confirm Registration Dialog */}
      <ConfirmDialog
        isOpen={confirmRegisterOpen}
        onClose={() => setConfirmRegisterOpen(false)}
        onConfirm={handleRegisterConfirm}
        isLoading={actionLoading}
        title="Confirm Event Registration"
        message={`Would you like to register for "${event.title}" on ${formatEventDate(
          event.startDate
        )}? A digital entry ticket will be generated for your attendee profile.`}
        confirmLabel="Confirm & Get Pass"
      />

      {/* Attendee details gate (events that require details) */}
      {detailsGateOpen && event && (
        <AttendeeDetailsGate
          open={detailsGateOpen}
          eventTitle={event.title}
          organizerName={event.organizer?.name || 'the organizer'}
          onClose={() => {
            setDetailsGateOpen(false);
            setDetailsGateTarget(null);
          }}
          onProceed={() => {
            const target = detailsGateTarget;
            setDetailsGateOpen(false);
            setDetailsGateTarget(null);
            if (target === 'paid') setPaymentOpen(true);
            else if (target === 'free') setConfirmRegisterOpen(true);
          }}
        />
      )}

      {/* Confirm Cancellation Dialog */}
      <ConfirmDialog
        isOpen={confirmCancelOpen}
        onClose={() => setConfirmCancelOpen(false)}
        onConfirm={handleCancelConfirm}
        isLoading={actionLoading}
        isDestructive
        title={isPaymentPending ? 'Withdraw Payment Request' : 'Cancel Registration'}
        message={
          isPaymentPending
            ? 'Withdraw your pending payment request? Any held spot will be released for other attendees.'
            : 'Are you sure you want to cancel your RSVP? This will free your spot for other attendees.'
        }
        confirmLabel={isPaymentPending ? 'Yes, Withdraw Request' : 'Yes, Cancel RSVP'}
      />

      {/* Manual-approval payment dialog (paid events only) */}
      <Modal
        isOpen={paymentOpen}
        onClose={() => {
          setPaymentOpen(false);
          setUtrError('');
        }}
        title="Pay & Register"
        description={`This is a paid event. Pay ${formatPrice(event.price)} to the organizer via UPI — scan the QR code or tap Pay via UPI app — then enter your 12-digit UTR below. Your pass is issued once the organizer approves the payment.`}
      >
        <div className="space-y-4">
          <div className="p-4 bg-[#F4F1EA] border border-[#E2DFD8] rounded-lg space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-[#5F635D]">Amount to pay</span>
              <span className="font-editorial text-lg font-bold text-[#1E2320]">{formatPrice(event.price)}</span>
            </div>
            {paymentLoading ? (
              <p className="text-xs text-[#5F635D]">Loading payment info…</p>
            ) : paymentError ? (
              <p className="text-xs text-rose-700">{paymentError}</p>
            ) : paymentUpiId ? (
              <>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-[#5F635D]">Pay to UPI ID</span>
                  <span className="flex items-center gap-1.5">
                    <span className="font-mono text-xs font-semibold text-[#1E2320] break-all">{paymentUpiId}</span>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(paymentUpiId || '');
                        setCopiedUpi(true);
                        setTimeout(() => setCopiedUpi(false), 2000);
                      }}
                      className="px-2 py-1 bg-[#1E3F35] text-white rounded-md text-[11px] font-medium hover:bg-[#163028] flex items-center gap-1 shrink-0"
                    >
                      {copiedUpi ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedUpi ? 'Copied' : 'Copy'}</span>
                    </button>
                  </span>
                </div>
                {upiQr && (
                  <div className="pt-2 flex flex-col items-center gap-2">
                    {/* Themed frame: the rounded corners live on this card
                        and on the logo patch, NOT on the QR image — the
                        QR itself stays square so its corner finder
                        patterns are never clipped. The logo patch sits
                        centered over the code (pointer-events-none: it
                        is display only) with curvy corners on both the
                        patch and the logo image. Fluid width: the frame
                        caps at the old 194px but shrinks on narrow
                        screens (aspect-square keeps the QR square), so
                        the block can never push its card out of frame. */}
                    <div className="bg-white rounded-2xl border border-[#E2DFD8] p-2 shadow-sm w-full max-w-[194px]">
                      <div className="relative w-full aspect-square">
                        <img
                          src={upiQr}
                          alt={`QR code to pay ${formatPrice(event.price)} to ${paymentUpiId}`}
                          className="w-full h-full block"
                        />
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                          <div
                            className="bg-white rounded-2xl border border-[#E7E3DB] shadow-sm p-1 flex items-center justify-center"
                            style={{ width: '24%', height: '24%' }}
                          >
                            <img
                              src="/locora-logo.png"
                              alt="Locora"
                              className="w-full h-full object-contain rounded-xl"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                    <p className="text-[11px] text-[#5F635D] text-center">
                      Scan with any UPI app — the amount is prefilled
                    </p>
                    <a
                      href={upiUri}
                      className="px-4 py-2 bg-[#1E3F35] text-white rounded-lg text-xs font-semibold hover:bg-[#163028] transition-colors"
                    >
                      Pay via UPI app
                    </a>
                  </div>
                )}
              </>
            ) : (
              <p className="text-xs text-[#5F635D]">
                The organizer hasn't shared a UPI ID — pay them directly via UPI and enter your UTR below.
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#1E2320] mb-1.5">
              UTR (12 digits) *
            </label>
            <input
              type="text"
              inputMode="numeric"
              value={utr}
              onChange={(e) => {
                setUtr(e.target.value.replace(/[^0-9\s]/g, ''));
                setUtrError('');
              }}
              placeholder="e.g. 123456789012"
              className={`w-full text-xs bg-white border rounded-lg p-3 text-[#1E2320] focus:border-[#1E3F35] ${
                utrError ? 'border-rose-500' : 'border-[#E2DFD8]'
              }`}
            />
            {utrError && <p className="text-[11px] text-rose-600 mt-1">{utrError}</p>}
            <p className="text-[11px] text-[#8C887E] mt-1">
              Find it in your UPI app under the payment's transaction details.
            </p>
          </div>

          <button
            type="button"
            disabled={actionLoading}
            onClick={handlePaymentSubmit}
            className="w-full py-3 text-xs font-semibold text-white bg-[#1E3F35] hover:bg-[#163028] rounded-lg transition-colors disabled:opacity-60"
          >
            {actionLoading ? 'Submitting…' : 'Submit Payment for Approval'}
          </button>
        </div>
      </Modal>

      {/* Share Modal */}
      <Modal
        isOpen={shareModalOpen}
        onClose={() => setShareModalOpen(false)}
        title="Share Event"
        description="Share this gathering with your neighbors and friends."
      >
        <div className="space-y-4">
          <div className="flex items-center gap-2 p-2 bg-[#F4F1EA] border border-[#E2DFD8] rounded-lg">
            <input
              type="text"
              readOnly
              value={window.location.href}
              className="flex-1 bg-transparent text-xs text-[#1E2320] border-0 focus:outline-hidden truncate"
            />
            <button
              onClick={handleCopyLink}
              className="px-3 py-1.5 bg-[#1E3F35] text-white rounded-md text-xs font-medium hover:bg-[#163028] flex items-center gap-1 shrink-0"
            >
              {copiedLink ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedLink ? 'Copied' : 'Copy'}</span>
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
