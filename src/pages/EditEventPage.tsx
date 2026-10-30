import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Check, AlertCircle } from 'lucide-react';
import { EventCategory, EventItem } from '../types';
import { DEMO_CATEGORIES } from '../mocks/demo-data';
import { eventsService, isEventOwner } from '../services/events-service';
import { authService } from '../services/auth-service';
import { isAdminEmail } from '../services/roles-service';
import { useToast } from '../components/ui/Toast';
import { ThemedSelect } from '../components/ui/ThemedSelect';
import { FormSkeleton } from '../components/ui/LoadingSkeleton';
import { PRESET_COVER_IMAGES } from './CreateEventPage';

export function EditEventPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [event, setEvent] = useState<EventItem | null>(null);
  // True when the loaded event belongs to another organizer. The form is
  // never rendered in that case, and the save is ownership-checked too.
  const [notOwner, setNotOwner] = useState(false);

  // Ownership for this page: the event's owner ONLY. Admins may delete
  // and operate events, but they cannot edit event details.
  const currentUser = authService.getCurrentUser();
  const isAdmin =
    !!currentUser &&
    currentUser.role === 'admin' &&
    isAdminEmail(currentUser.email);
  const ownershipOpts = {
    ownerEmail: currentUser?.email,
    isAdmin,
  };

  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<EventCategory>('Food & Community');
  const [coverImage, setCoverImage] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [venueName, setVenueName] = useState('');
  const [address, setAddress] = useState('');

  const [price, setPrice] = useState('0');
  const [upiId, setUpiId] = useState('');
  // Attendee details gate (see CreateEventPage): on unless the
  // organizer opted out. Older events predate this flag and behave as
  // if it were on.
  const [requireAttendeeDetails, setRequireAttendeeDetails] = useState(true);
  const [capacity, setCapacity] = useState('50');
  const [tagsInput, setTagsInput] = useState('');

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    async function loadEvent() {
      if (!eventId) return;
      setLoading(true);
      try {
        const data = await eventsService.getEventById(eventId);
        if (data) {
          if (!isEventOwner(data, currentUser?.email)) {
            setNotOwner(true);
            setEvent(data);
            return;
          }
          setEvent(data);
          setTitle(data.title);
          setSummary(data.summary);
          setDescription(data.description);
          setCategory(data.category);
          setCoverImage(data.coverImage);
          setStartDate(data.startDate.slice(0, 16));
          setEndDate(data.endDate.slice(0, 16));
          setVenueName(data.venueName);
          setAddress(data.address);
          setPrice(String(data.price));
          setUpiId(data.upiId || '');
          setRequireAttendeeDetails(data.requireAttendeeDetails ?? true);
          setCapacity(String(data.capacity));
          setTagsInput(data.tags.join(', '));
        }
      } finally {
        setLoading(false);
      }
    }
    loadEvent();
  }, [eventId]);

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!title.trim()) errs.title = 'Title is required.';
    if (!description.trim()) errs.description = 'Description is required.';
    if (!venueName.trim()) errs.venueName = 'Venue name is required.';
    if (!address.trim()) errs.address = 'Street address is required.';

    const start = new Date(startDate);
    const end = new Date(endDate);
    if (isNaN(start.getTime())) errs.startDate = 'Valid start date & time required.';
    if (isNaN(end.getTime())) errs.endDate = 'Valid end date & time required.';
    if (end <= start) errs.endDate = 'End time must be after start time.';

    const capNum = Number(capacity);
    if (isNaN(capNum) || capNum <= 0) errs.capacity = 'Capacity must be at least 1 spot.';

    // Same rule as create: paid events need a UPI ID, because it powers
    // the QR code and tap-to-pay UPI link in the payment dialog. Free
    // events (price 0) leave it optional.
    if (Number(price) > 0 && !upiId.trim()) errs.upiId = 'UPI ID is required for paid events — attendees pay via the QR code and UPI link.';

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!eventId || !validate()) return;

    setSubmitting(true);
    try {
      const tags = tagsInput
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);

      await eventsService.updateEvent(eventId, {
        title: title.trim(),
        summary: summary.trim(),
        description: description.trim(),
        category,
        coverImage,
        startDate: new Date(startDate).toISOString(),
        endDate: new Date(endDate).toISOString(),
        venueName: venueName.trim(),
        address: address.trim(),
        // Location rule: the neighborhood is the city when a state is
        // selected, otherwise none (state/city are carried from the
        // stored event, since the edit form has no location picker).
        neighborhood: event?.state ? (event?.city || '') : '',
        price: Number(price),
        upiId: upiId.trim() || undefined,
        requireAttendeeDetails,
        capacity: Number(capacity),
        tags,
      }, { ...ownershipOpts, allowAdmin: false });

      toast({
        type: 'success',
        title: 'Event Updated',
        description: 'Changes have been saved to your listing.',
      });

      navigate(`/events/${eventId}`);
    } catch {
      toast({
        type: 'error',
        title: 'Failed to update event',
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <FormSkeleton />;
  }

  if (!event) {
    return (
      <div className="max-w-md mx-auto px-4 py-20 text-center space-y-4">
        <h2 className="text-xl font-bold text-slate-900">Event Not Found</h2>
        <Link to="/organizer/events" className="text-xs font-semibold text-indigo-600 underline">
          Return to Events
        </Link>
      </div>
    );
  }

  if (notOwner) {
    return (
      <div className="max-w-md mx-auto px-4 py-20 text-center space-y-4">
        <h2 className="font-editorial text-2xl font-bold text-[#1E2320]">
          {isAdmin
            ? 'Admins cannot edit event details'
            : 'This event belongs to another organizer'}
        </h2>
        <p className="text-sm text-[#5F635D]">
          {isAdmin
            ? 'You can delete and manage this event from the Events list, but its details can only be edited by the organizer who created it.'
            : 'You can only edit events you created. This event\'s details are shown to its own organizer, not here.'}
        </p>
        <Link to="/organizer/events" className="text-xs font-semibold text-[#1E3F35] hover:underline">
          Return to Events
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      <Link
        to="/organizer/events"
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#5F635D] hover:text-[#1E2320] transition-colors"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        <span>Back to Events</span>
      </Link>

      <div className="pb-4 border-b border-[#E5E1D8]">
        <h1 className="font-editorial text-3xl font-bold tracking-tight text-[#1E2320]">
          Edit Event Details
        </h1>
        <p className="text-sm text-[#5F635D] mt-1">
          Update event schedules, capacity limits, or venue location.
        </p>
      </div>

      <form onSubmit={handleUpdate} className="space-y-8 bg-white p-6 sm:p-8 rounded-2xl border border-[#E5E1D8] shadow-xs">
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-[#1E2320] mb-1.5">
              Event Title *
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full text-xs bg-white border border-[#E2DFD8] rounded-lg p-3 text-[#1E2320] focus:border-[#1E3F35]"
            />
            {errors.title && <p className="text-[11px] text-rose-600 mt-1">{errors.title}</p>}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-[#1E2320] mb-1.5">
                Category *
              </label>
              <ThemedSelect
                value={category}
                options={DEMO_CATEGORIES.map((cat) => ({ value: cat, label: cat }))}
                onChange={(v) => setCategory(v as EventCategory)}
                ariaLabel="Category"
                size="form"
              />
            </div>

          </div>

          <div>
            <label className="block text-xs font-semibold text-[#1E2320] mb-1.5">
              Description *
            </label>
            <textarea
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full text-xs bg-white border border-[#E2DFD8] rounded-lg p-3 text-[#1E2320] focus:border-[#1E3F35]"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-[#1E2320] mb-1.5">
                Start Date & Time *
              </label>
              <input
                type="datetime-local"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full text-xs bg-white border border-[#E2DFD8] rounded-lg p-3 text-[#1E2320] focus:border-[#1E3F35]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#1E2320] mb-1.5">
                End Date & Time *
              </label>
              <input
                type="datetime-local"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full text-xs bg-white border border-[#E2DFD8] rounded-lg p-3 text-[#1E2320] focus:border-[#1E3F35]"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-[#1E2320] mb-1.5">
                Venue Name *
              </label>
              <input
                type="text"
                value={venueName}
                onChange={(e) => setVenueName(e.target.value)}
                className="w-full text-xs bg-white border border-[#E2DFD8] rounded-lg p-3 text-[#1E2320] focus:border-[#1E3F35]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#1E2320] mb-1.5">
                Street Address *
              </label>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="w-full text-xs bg-white border border-[#E2DFD8] rounded-lg p-3 text-[#1E2320] focus:border-[#1E3F35]"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-[#1E2320] mb-1.5">
                Capacity *
              </label>
              <input
                type="number"
                value={capacity}
                onChange={(e) => setCapacity(e.target.value)}
                className="w-full text-xs bg-white border border-[#E2DFD8] rounded-lg p-3 text-[#1E2320] focus:border-[#1E3F35]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#1E2320] mb-1.5">
                Price (₹)
              </label>
              <input
                type="number"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className="w-full text-xs bg-white border border-[#E2DFD8] rounded-lg p-3 text-[#1E2320] focus:border-[#1E3F35]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#1E2320] mb-1.5">
                Organizer UPI ID {Number(price) > 0 ? '*' : '(for paid events)'}
              </label>
              <input
                type="text"
                value={upiId}
                onChange={(e) => setUpiId(e.target.value)}
                placeholder="e.g. yourname@okhdfcbank"
                className={`w-full text-xs bg-white border rounded-lg p-3 text-[#1E2320] focus:border-[#1E3F35] ${
                  errors.upiId ? 'border-rose-500' : 'border-[#E2DFD8]'
                }`}
              />
              {errors.upiId && <p className="text-[11px] text-rose-600 mt-1">{errors.upiId}</p>}
              <span className="text-[11px] text-[#8C887E]">
                Shown to attendees of paid events as a QR code and UPI link so they can pay you directly. Optional for free events.
              </span>
            </div>

            <div className="flex items-start gap-3 bg-[#FAF8F5] border border-[#E5E1D8] rounded-xl p-4">
              <input
                type="checkbox"
                checked={requireAttendeeDetails}
                onChange={(e) => setRequireAttendeeDetails(e.target.checked)}
                className="mt-0.5 w-4 h-4 accent-[#1E3F35]"
              />
              <div>
                <p className="text-xs font-semibold text-[#1E2320]">Require attendee details for registration</p>
                <p className="text-[11px] text-[#8C887E] leading-relaxed mt-0.5">
                  Attendees must provide their full name, mobile number and email, and confirm sharing them with you (the organizer) only, before they can register. Turn this off to let anyone register with no details.
                </p>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#1E2320] mb-1.5">
                Tags
              </label>
              <input
                type="text"
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                className="w-full text-xs bg-white border border-[#E2DFD8] rounded-lg p-3 text-[#1E2320] focus:border-[#1E3F35]"
              />
            </div>
          </div>
        </div>

        <div className="pt-6 border-t border-[#EBE7DF] flex items-center justify-end gap-3">
          <Link
            to="/organizer/events"
            className="px-4 py-2.5 text-xs font-medium text-[#5F635D] hover:text-[#1E2320]"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={submitting}
            className="px-6 py-2.5 bg-[#1E3F35] hover:bg-[#163028] text-white text-xs font-semibold rounded-lg transition-colors shadow-xs"
          >
            {submitting ? 'Saving Changes...' : 'Save Changes'}
          </button>
        </div>
      </form>
    </div>
  );
}
