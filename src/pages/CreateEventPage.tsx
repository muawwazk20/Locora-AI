import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Image, AlertCircle, Sparkles, Check } from 'lucide-react';
import { EventCategory, EventItem } from '../types';
import { DEMO_CATEGORIES } from '../mocks/demo-data';
import { LocationPicker } from '../components/LocationPicker';
import { ThemedSelect } from '../components/ui/ThemedSelect';
import { ImageUploadField } from '../components/events/ImageUploadField';
import { eventsService } from '../services/events-service';
import { authService } from '../services/auth-service';
import { useToast } from '../components/ui/Toast';

// Cover images live in src/assets/images. They must be imported so Vite
// bundles them into dist/ for production. A plain src/ URL
// string only works in Vite dev (via vite.middlewares) and 404s in a
// production build, which is why the cards showed broken images.
import heroGatheringImg from '../assets/images/hero_neighborhood_gathering_1792850960020.jpg';
import techHackathonImg from '../assets/images/event_tech_hackathon_1792850960780.jpg';
import farmersMarketImg from '../assets/images/event_farmers_market_1792850961672.jpg';
import acousticMusicImg from '../assets/images/event_acoustic_music_1792850962324.jpg';
import morningYogaImg from '../assets/images/event_morning_yoga_1792850962615.jpg';

export const PRESET_COVER_IMAGES = [
  {
    name: 'Evening Gathering',
    url: heroGatheringImg,
  },
  {
    name: 'Tech & Hackathon',
    url: techHackathonImg,
  },
  {
    name: 'Farmers & Food Market',
    url: farmersMarketImg,
  },
  {
    name: 'Acoustic Concert',
    url: acousticMusicImg,
  },
  {
    name: 'Morning Wellness & Yoga',
    url: morningYogaImg,
  },
];

export function CreateEventPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const currentUser = authService.getCurrentUser();

  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<EventCategory>('Food & Community');
  const [coverImage, setCoverImage] = useState(PRESET_COVER_IMAGES[0].url);
  const [customImageUrl, setCustomImageUrl] = useState('');
  // Uploaded cover (data URL from ImageUploadField). Only one cover source
  // is active at a time: picking a preset, typing a URL, or uploading each
  // clears the others.
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [startDate, setStartDate] = useState('2026-11-20T18:00');
  const [endDate, setEndDate] = useState('2026-11-20T21:00');
  const [venueName, setVenueName] = useState('');
  const [address, setAddress] = useState('');
  // Worldwide event location (Country -> State -> City). Previously every
  // event was silently fixed to 'Metro City' with no way to change it.
  const [location, setLocation] = useState({ country: '', state: '', city: '' });
  const [price, setPrice] = useState('0');
  // Organizer's UPI ID for manual-approval payments on paid events.
  // Shown to attendees at registration; blank means "pay the organizer
  // directly" with no specific ID.
  const [upiId, setUpiId] = useState('');
  // Attendee details gate: on by default. When on, registering requires
  // the attendee's name, mobile number and email, plus a confirmation
  // that those details are shared with the organizer only.
  const [requireAttendeeDetails, setRequireAttendeeDetails] = useState(true);
  const [capacity, setCapacity] = useState('50');
  const [tagsInput, setTagsInput] = useState('Community, Gathering');

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

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
    if (end <= start) errs.endDate = 'End time must be strictly after start time.';

    const capNum = Number(capacity);
    if (isNaN(capNum) || capNum <= 0) errs.capacity = 'Capacity must be at least 1 spot.';

    const priceNum = Number(price);
    if (isNaN(priceNum) || priceNum < 0) errs.price = 'Price cannot be negative.';
    // Paid events need a UPI ID: it is what powers the QR code and the
    // tap-to-pay UPI link in the payment dialog. Free events (price 0)
    // leave it optional.
    if (priceNum > 0 && !upiId.trim()) errs.upiId = 'UPI ID is required for paid events — attendees pay via the QR code and UPI link.';

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) {
      toast({
        type: 'error',
        title: 'Validation Error',
        description: 'Please correct the highlighted fields before submitting.',
      });
      return;
    }

    // Ownership: the event is attributed to the signed-in user, not to a
    // shared demo organizer. Without a signed-in user there is no owner,
    // so the event cannot be created (the OrganizerGuard already blocks
    // guests from reaching this page; this is the defensive second check).
    if (!currentUser) {
      toast({
        type: 'error',
        title: 'Sign in required',
        description: 'Please sign in before creating an event.',
      });
      return;
    }

    setSubmitting(true);
    try {
      const activeImage = customImageUrl.trim()
        ? customImageUrl.trim()
        : uploadedImage || coverImage;
      const tags = tagsInput
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);

      const newEvent = await eventsService.createEvent({
        title: title.trim(),
        summary: summary.trim() || description.trim().slice(0, 140),
        description: description.trim(),
        category,
        coverImage: activeImage,
        startDate: new Date(startDate).toISOString(),
        endDate: new Date(endDate).toISOString(),
        venueName: venueName.trim(),
        address: address.trim(),
        // Location rule: the neighborhood is the city when a state is
        // selected, otherwise none.
        neighborhood: location.state.trim() ? (location.city.trim() || 'Metro City') : '',
        city: location.city.trim() || 'Metro City',
        state: location.state.trim() || undefined,
        country: location.country.trim() || undefined,
        price: Number(price),
        upiId: upiId.trim() || undefined,
        requireAttendeeDetails,
        capacity: Number(capacity),
        tags,
        organizer: {
          id: currentUser.id,
          name: currentUser.name,
          slug: currentUser.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
          avatar: currentUser.avatar,
          bio: currentUser.bio,
          email: currentUser.email,
          location: [currentUser.state, currentUser.city].filter(Boolean).join(', '),
          eventsCount: 0,
          totalAttendeesServed: 0,
        },
        createdByEmail: currentUser.email,
      });

      toast({
        type: 'success',
        title: 'Event Created Successfully',
        description: `"${newEvent.title}" is now published and open for RSVPs.`,
      });

      navigate(`/events/${newEvent.id}`);
    } catch {
      toast({
        type: 'error',
        title: 'Failed to create event',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Back button */}
      <Link
        to="/organizer/dashboard"
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#5F635D] hover:text-[#1E2320] transition-colors"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        <span>Back to Organizer Console</span>
      </Link>

      {/* Header */}
      <div className="pb-4 border-b border-[#E5E1D8]">
        <h1 className="font-editorial text-3xl font-bold tracking-tight text-[#1E2320]">
          Create New Community Event
        </h1>
        <p className="text-sm text-[#5F635D] mt-1">
          Publish a gathering, workshop, meetup, or performance for local residents.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8 bg-white p-6 sm:p-8 rounded-2xl border border-[#E5E1D8] shadow-xs">
        {/* Section: Basics */}
        <div className="space-y-4">
          <h2 className="font-editorial text-base font-bold text-[#1E2320] pb-2 border-b border-[#EBE7DF]">
            1. Event Overview
          </h2>

          <div>
            <label className="block text-xs font-semibold text-[#1E2320] mb-1.5">
              Event Title *
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Downtown Weekend Artisan & Coffee Walk"
              className={`w-full text-xs bg-white border rounded-lg p-3 text-[#1E2320] focus:border-[#1E3F35] focus:ring-1 focus:ring-[#1E3F35] ${
                errors.title ? 'border-rose-500' : 'border-[#E2DFD8]'
              }`}
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

            <div>
              <label className="block text-xs font-semibold text-[#1E2320] mb-1.5">
                Short Summary (1-2 sentences)
              </label>
              <input
                type="text"
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                placeholder="Brief takeaway shown on discovery cards"
                className="w-full text-xs bg-white border border-[#E2DFD8] rounded-lg p-3 text-[#1E2320] focus:border-[#1E3F35]"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#1E2320] mb-1.5">
              Detailed Description *
            </label>
            <textarea
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What can attendees expect? Outline schedule, what to bring, and special guidelines."
              className={`w-full text-xs bg-white border rounded-lg p-3 text-[#1E2320] focus:border-[#1E3F35] focus:ring-1 focus:ring-[#1E3F35] ${
                errors.description ? 'border-rose-500' : 'border-[#E2DFD8]'
              }`}
            />
            {errors.description && (
              <p className="text-[11px] text-rose-600 mt-1">{errors.description}</p>
            )}
          </div>
        </div>

        {/* Section: Visual Asset Selection */}
        <div className="space-y-4">
          <h2 className="font-editorial text-base font-bold text-[#1E2320] pb-2 border-b border-[#EBE7DF]">
            2. Cover Artwork
          </h2>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {PRESET_COVER_IMAGES.map((preset) => {
              const selected =
                coverImage === preset.url && !customImageUrl && !uploadedImage;
              return (
                <button
                  key={preset.name}
                  type="button"
                  onClick={() => {
                    setCoverImage(preset.url);
                    setCustomImageUrl('');
                    setUploadedImage(null);
                  }}
                  className={`relative rounded-xl overflow-hidden aspect-[4/3] border-2 transition-all cursor-pointer ${
                    selected ? 'border-[#1E3F35] shadow-md ring-2 ring-[#D0E2D9]' : 'border-transparent opacity-80 hover:opacity-100'
                  }`}
                >
                  <img
                    src={preset.url}
                    alt={preset.name}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                  {selected && (
                    <div className="absolute top-1.5 right-1.5 p-1 bg-[#1E3F35] text-white rounded-full">
                      <Check className="w-3 h-3" />
                    </div>
                  )}
                  <div className="absolute bottom-0 inset-x-0 bg-[#1E2320]/80 p-1 text-[10px] text-white text-center truncate">
                    {preset.name}
                  </div>
                </button>
              );
            })}
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#1E2320] mb-1.5">
              Or Upload Your Own Image
            </label>
            <ImageUploadField
              uploadedImage={uploadedImage}
              onUpload={(dataUrl) => {
                setUploadedImage(dataUrl);
                setCustomImageUrl('');
              }}
              onRemove={() => setUploadedImage(null)}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#1E2320] mb-1.5">
              Or Custom Image URL
            </label>
            <input
              type="url"
              value={customImageUrl}
              onChange={(e) => {
                setCustomImageUrl(e.target.value);
                if (e.target.value.trim()) setUploadedImage(null);
              }}
              placeholder="https://example.com/photo.jpg"
              className="w-full text-xs bg-white border border-[#E2DFD8] rounded-lg p-3 text-[#1E2320] focus:border-[#1E3F35]"
            />
          </div>
        </div>

        {/* Section: Date, Time & Venue */}
        <div className="space-y-4">
          <h2 className="font-editorial text-base font-bold text-[#1E2320] pb-2 border-b border-[#EBE7DF]">
            3. Schedule & Location
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-[#1E2320] mb-1.5">
                Start Date & Time *
              </label>
              <input
                type="datetime-local"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className={`w-full text-xs bg-white border rounded-lg p-3 text-[#1E2320] focus:border-[#1E3F35] ${
                  errors.startDate ? 'border-rose-500' : 'border-[#E2DFD8]'
                }`}
              />
              {errors.startDate && (
                <p className="text-[11px] text-rose-600 mt-1">{errors.startDate}</p>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#1E2320] mb-1.5">
                End Date & Time *
              </label>
              <input
                type="datetime-local"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className={`w-full text-xs bg-white border rounded-lg p-3 text-[#1E2320] focus:border-[#1E3F35] ${
                  errors.endDate ? 'border-rose-500' : 'border-[#E2DFD8]'
                }`}
              />
              {errors.endDate && (
                <p className="text-[11px] text-rose-600 mt-1">{errors.endDate}</p>
              )}
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
                placeholder="e.g. Waterfront Community Hall"
                className={`w-full text-xs bg-white border rounded-lg p-3 text-[#1E2320] focus:border-[#1E3F35] ${
                  errors.venueName ? 'border-rose-500' : 'border-[#E2DFD8]'
                }`}
              />
              {errors.venueName && (
                <p className="text-[11px] text-rose-600 mt-1">{errors.venueName}</p>
              )}
            </div>

          </div>

          <div>
            <label className="block text-xs font-semibold text-[#1E2320] mb-1.5">
              Event Location — Country, State, City
            </label>
            <LocationPicker mode="form" value={location} onChange={setLocation} />
            <p className="text-[11px] text-[#5F635D] mt-1">
              Pick anywhere in the world. If left blank, the event stays
              listed under Metro City as before.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#1E2320] mb-1.5">
              Street Address *
            </label>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="e.g. 240 Pier Street"
              className={`w-full text-xs bg-white border rounded-lg p-3 text-[#1E2320] focus:border-[#1E3F35] ${
                errors.address ? 'border-rose-500' : 'border-[#E2DFD8]'
              }`}
            />
            {errors.address && (
              <p className="text-[11px] text-rose-600 mt-1">{errors.address}</p>
            )}
          </div>
        </div>

        {/* Section: Capacity & Pricing */}
        <div className="space-y-4">
          <h2 className="font-editorial text-base font-bold text-[#1E2320] pb-2 border-b border-[#EBE7DF]">
            4. Capacity & Pricing
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-[#1E2320] mb-1.5">
                Attendee Capacity *
              </label>
              <input
                type="number"
                min="1"
                value={capacity}
                onChange={(e) => setCapacity(e.target.value)}
                className={`w-full text-xs bg-white border rounded-lg p-3 text-[#1E2320] focus:border-[#1E3F35] ${
                  errors.capacity ? 'border-rose-500' : 'border-[#E2DFD8]'
                }`}
              />
              {errors.capacity && (
                <p className="text-[11px] text-rose-600 mt-1">{errors.capacity}</p>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#1E2320] mb-1.5">
                Ticket Price (₹) *
              </label>
              <input
                type="number"
                min="0"
                step="1"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="0 for free"
                className={`w-full text-xs bg-white border rounded-lg p-3 text-[#1E2320] focus:border-[#1E3F35] ${
                  errors.price ? 'border-rose-500' : 'border-[#E2DFD8]'
                }`}
              />
              <span className="text-[11px] text-[#8C887E]">Set 0 for free community RSVP</span>
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
                Tags (comma-separated)
              </label>
              <input
                type="text"
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                placeholder="Outdoor, Music, Workshop"
                className="w-full text-xs bg-white border border-[#E2DFD8] rounded-lg p-3 text-[#1E2320] focus:border-[#1E3F35]"
              />
            </div>
          </div>
        </div>

        {/* Submit Bar */}
        <div className="pt-6 border-t border-[#EBE7DF] flex items-center justify-end gap-3">
          <Link
            to="/organizer/dashboard"
            className="px-4 py-2.5 text-xs font-medium text-[#5F635D] hover:text-[#1E2320]"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={submitting}
            className="px-6 py-2.5 bg-[#1E3F35] hover:bg-[#163028] text-white text-xs font-semibold rounded-lg transition-colors shadow-xs"
          >
            {submitting ? 'Publishing Event...' : 'Publish Event'}
          </button>
        </div>
      </form>
    </div>
  );
}
