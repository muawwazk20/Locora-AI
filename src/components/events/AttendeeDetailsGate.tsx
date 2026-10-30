import React, { useEffect, useState } from 'react';
import { Modal } from '../ui/Modal';
import { authService } from '../../services/auth-service';

// Attendee details gate, shown before a registration for an event that
// requires attendee details (EventItem.requireAttendeeDetails, true
// unless the organizer opted out):
//  1. Capture (once): if the signed-in profile is missing a full name,
//     mobile number, or email, the user enters them here. The details
//     are saved on the profile, so later registrations never ask again.
//  2. Confirm (every registration): the saved details are shown with
//     the promise that they are shared with the organizer only, and the
//     user confirms (or edits them) before registration proceeds.
// The email field is locked to the signed-in account's email — the
// account email is the user's identity (admin checks and organizer
// records key off it), so it must not be changed here. It is editable
// only when the profile has no email at all (local fallback edge case).
// This gate never runs for guests: registration itself requires
// sign-in first, and the existing service error covers that path.

interface AttendeeDetailsGateProps {
  open: boolean;
  eventTitle: string;
  organizerName: string;
  onProceed: () => void;
  onClose: () => void;
}

function isComplete(name: string, phone: string, email: string): boolean {
  const digits = phone.replace(/\D/g, '');
  return (
    name.trim().length > 0 &&
    digits.length >= 7 &&
    digits.length <= 15 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
  );
}

export function AttendeeDetailsGate({ open, eventTitle, organizerName, onProceed, onClose }: AttendeeDetailsGateProps) {
  const [view, setView] = useState<'capture' | 'confirm'>('confirm');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [emailEditable, setEmailEditable] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  // (Re)initialize whenever the gate opens, from the live profile.
  useEffect(() => {
    if (!open) return;
    const user = authService.getCurrentUser();
    const n = user?.name || '';
    const p = user?.phone || '';
    const e = user?.email || '';
    setName(n);
    setPhone(p);
    setEmail(e);
    setEmailEditable(!e);
    setError('');
    setView(isComplete(n, p, e) ? 'confirm' : 'capture');
  }, [open ]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!name.trim()) {
      setError('Please enter your full name.');
      return;
    }
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 7 || digits.length > 15) {
      setError('Please enter a valid mobile number (7–15 digits).');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Please enter a valid email address.');
      return;
    }
    setSaving(true);
    try {
      const updates: { name: string; phone: string; email?: string } = {
        name: name.trim(),
        phone: phone.trim(),
      };
      if (emailEditable) updates.email = email.trim();
      await authService.updateProfile(updates);
      setView('confirm');
    } catch {
      setError('Could not save your details. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title={view === 'capture' ? 'Your details' : 'Confirm your details'}
      description={
        view === 'capture'
          ? `Before registering for "${eventTitle}", please share your details once. You won't be asked again.`
          : undefined
      }
      maxWidth="md"
    >
      {view === 'capture' ? (
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-[#1E2320] mb-1.5">Full name *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your full name"
              className="w-full text-xs bg-white border border-[#E2DFD8] rounded-lg p-3 text-[#1E2320] focus:border-[#1E3F35]"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#1E2320] mb-1.5">Mobile number *</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="e.g. 9876543210"
              className="w-full text-xs bg-white border border-[#E2DFD8] rounded-lg p-3 text-[#1E2320] focus:border-[#1E3F35]"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#1E2320] mb-1.5">
              Email address * {!emailEditable && <span className="font-normal text-[#8C887E]">(from your signed-in account)</span>}
            </label>
            <input
              type="email"
              value={email}
              disabled={!emailEditable}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
              className="w-full text-xs bg-white border border-[#E2DFD8] rounded-lg p-3 text-[#1E2320] focus:border-[#1E3F35] disabled:bg-[#FAF8F5] disabled:text-[#5F635D]"
            />
          </div>
          {error && <p className="text-[11px] text-rose-600">{error}</p>}
          <p className="text-[11px] text-[#8C887E] leading-relaxed">
            These details are shared with the event organizer only.
          </p>
          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 text-xs font-semibold text-[#5F635D] hover:text-[#1E2320] transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2.5 bg-[#1E3F35] hover:bg-[#163028] text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-60"
            >
              {saving ? 'Saving…' : 'Save & Continue'}
            </button>
          </div>
        </form>
      ) : (
        <div className="space-y-4">
          <div className="bg-[#FAF8F5] border border-[#E5E1D8] rounded-xl p-4 space-y-1.5 text-xs">
            <p className="text-[#1E2320]"><span className="text-[#5F635D]">Name:</span> {name}</p>
            <p className="text-[#1E2320]"><span className="text-[#5F635D]">Mobile:</span> {phone}</p>
            <p className="text-[#1E2320]"><span className="text-[#5F635D]">Email:</span> {email}</p>
          </div>
          <p className="text-xs text-[#5F635D] leading-relaxed">
            These details will be shared with <span className="font-semibold text-[#1E2320]">{organizerName}</span> (the
            organizer) only, for managing your registration for &ldquo;{eventTitle}&rdquo;.
          </p>
          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setView('capture')}
              className="px-4 py-2.5 text-xs font-semibold text-[#5F635D] hover:text-[#1E2320] transition-colors"
            >
              Edit details
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 text-xs font-semibold text-[#5F635D] hover:text-[#1E2320] transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onProceed}
              className="px-5 py-2.5 bg-[#1E3F35] hover:bg-[#163028] text-white text-xs font-semibold rounded-lg transition-colors"
            >
              Confirm & Continue
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
