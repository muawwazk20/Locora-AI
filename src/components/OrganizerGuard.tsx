import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { authService } from '../services/auth-service';
import {
  fetchAccess,
  isAdminEmail,
  requestOrganizerAccess,
} from '../services/roles-service';
import { useToast } from './ui/Toast';

type GuardState = 'loading' | 'allowed' | 'denied' | 'pending' | 'guest';

// Route guard for organizer-only pages (posting, editing, organizer hub,
// attendees, admin). Attendees and guests never see the wrapped page.
//
// The shared access record (Supabase, via /api/organizer-access) is the
// authority when it answers. If it does not answer (table not created yet,
// network failure), the guard fails closed: a locally stored 'organizer'
// claim is NOT trusted, because organizer used to be self-selected at
// sign-up. The one exception is an admin signed in with Google — the
// callback sets role 'admin' for admin emails — so admins are never locked
// out of their own site by a missing table.
export function OrganizerGuard({ children }: { children: React.ReactNode }) {
  const { toast } = useToast();
  const [state, setState] = useState<GuardState>('loading');
  const [requesting, setRequesting] = useState(false);

  useEffect(() => {
    async function check() {
      const user = authService.getCurrentUser();
      if (!user) {
        setState('guest');
        return;
      }
      const access = await fetchAccess(user.email);
      if (access) {
        if (access.role === 'admin' || access.role === 'organizer') {
          setState('allowed');
        } else if (access.role === 'pending') {
          setState('pending');
        } else {
          setState('denied');
        }
        return;
      }
      // API did not answer: fail closed, except Google-signed-in admins.
      if (user.role === 'admin' && isAdminEmail(user.email)) {
        setState('allowed');
      } else {
        setState('denied');
      }
    }
    check();
  }, []);

  const handleRequest = async () => {
    const user = authService.getCurrentUser();
    if (!user) return;
    setRequesting(true);
    try {
      await requestOrganizerAccess(user.email, user.name);
      setState('pending');
      toast({
        type: 'success',
        title: 'Organizer request sent',
        description: 'An admin will review it. You will be able to post events once approved.',
      });
    } catch (err: unknown) {
      toast({
        type: 'error',
        title: 'Could not send the request',
        description: err instanceof Error ? err.message : 'Please try again.',
      });
    } finally {
      setRequesting(false);
    }
  };

  if (state === 'loading') {
    return (
      <div className="max-w-lg mx-auto px-4 py-20 text-center">
        <p className="text-sm text-[#5F635D]">Checking organizer access…</p>
      </div>
    );
  }

  if (state === 'allowed') {
    return <>{children}</>;
  }

  if (state === 'guest') {
    return (
      <div className="max-w-lg mx-auto px-4 py-20 text-center space-y-4">
        <div className="w-12 h-12 bg-[#EAF1ED] text-[#1E3F35] rounded-xl flex items-center justify-center mx-auto">
          <ShieldAlert className="w-6 h-6" />
        </div>
        <h2 className="font-editorial text-2xl font-bold text-[#1E2320]">
          Sign in to continue
        </h2>
        <p className="text-sm text-[#5F635D]">
          Posting events is only available to approved organizers. Sign in
          first, then request organizer access from your profile.
        </p>
        <Link
          to="/login"
          className="inline-flex px-4 py-2 bg-[#1E3F35] text-white rounded-lg text-xs font-semibold hover:bg-[#163028] transition-colors"
        >
          Sign In
        </Link>
      </div>
    );
  }

  if (state === 'pending') {
    return (
      <div className="max-w-lg mx-auto px-4 py-20 text-center space-y-4">
        <div className="w-12 h-12 bg-[#EAF1ED] text-[#1E3F35] rounded-xl flex items-center justify-center mx-auto">
          <ShieldAlert className="w-6 h-6" />
        </div>
        <h2 className="font-editorial text-2xl font-bold text-[#1E2320]">
          Organizer request pending
        </h2>
        <p className="text-sm text-[#5F635D]">
          Your request to become an organizer has been sent and is waiting
          for an admin to approve it. Once approved, this page will open and
          you will be able to post events.
        </p>
        <Link
          to="/discover"
          className="inline-flex px-4 py-2 bg-[#1E3F35] text-white rounded-lg text-xs font-semibold hover:bg-[#163028] transition-colors"
        >
          Discover Events
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-20 text-center space-y-4">
      <div className="w-12 h-12 bg-[#EAF1ED] text-[#1E3F35] rounded-xl flex items-center justify-center mx-auto">
        <ShieldAlert className="w-6 h-6" />
      </div>
      <h2 className="font-editorial text-2xl font-bold text-[#1E2320]">
        Only approved organizers can post events
      </h2>
      <p className="text-sm text-[#5F635D]">
        Attendee accounts cannot post events. If you run events for your
        community, request organizer access and an admin will approve it.
      </p>
      <button
        type="button"
        onClick={handleRequest}
        disabled={requesting}
        className="px-5 py-2.5 bg-[#1E3F35] hover:bg-[#163028] text-white text-xs font-semibold rounded-lg transition-colors shadow-xs cursor-pointer"
      >
        {requesting ? 'Sending…' : 'Request Organizer Access'}
      </button>
      <div>
        <Link
          to="/discover"
          className="text-xs font-semibold text-[#1E3F35] hover:underline"
        >
          Back to Discover
        </Link>
      </div>
    </div>
  );
}
