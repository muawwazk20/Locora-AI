import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ShieldAlert, Check, X } from 'lucide-react';
import { authService } from '../services/auth-service';
import {
  fetchAccess,
  listPendingRequests,
  listApprovedOrganizers,
  decideRequest,
  revokeOrganizer,
  PendingRequest,
  ApprovedOrganizer,
} from '../services/roles-service';
import { useToast } from '../components/ui/Toast';
import { Skeleton } from '../components/ui/LoadingSkeleton';

// Admin page: review organizer requests. Only the admin accounts can open
// it; the server re-checks admin status on every list/approve/reject call.
export function AdminPage() {
  const { toast } = useToast();
  const currentUser = authService.getCurrentUser();
  const [state, setState] = useState<'loading' | 'allowed' | 'denied' | 'guest'>('loading');
  const [pending, setPending] = useState<PendingRequest[]>([]);
  const [organizers, setOrganizers] = useState<ApprovedOrganizer[]>([]);
  const [busyEmail, setBusyEmail] = useState<string | null>(null);
  // Email armed for removal confirmation: first click arms, second confirms.
  const [confirmRevokeEmail, setConfirmRevokeEmail] = useState<string | null>(null);
  const [error, setError] = useState('');

  const loadLists = async (adminEmail: string) => {
    let errMsg = '';
    try {
      setPending(await listPendingRequests(adminEmail));
    } catch (err: unknown) {
      errMsg = err instanceof Error ? err.message : 'Could not load requests.';
    }
    try {
      setOrganizers(await listApprovedOrganizers(adminEmail));
    } catch (err: unknown) {
      errMsg =
        errMsg || (err instanceof Error ? err.message : 'Could not load organizers.');
    }
    setError(errMsg);
  };

  const load = async () => {
    if (!currentUser) {
      setState('guest');
      return;
    }
    const access = await fetchAccess(currentUser.email);
    if (access?.role === 'admin') {
      setState('allowed');
      await loadLists(currentUser.email);
      return;
    }
    if (!access && currentUser.role === 'admin') {
      // API did not answer but this is a Google-signed-in admin account.
      setState('allowed');
      setError(
        'The organizer-access table may not be created yet in Supabase. Run the SQL in ORGANIZER_ACCESS_SETUP.md, then reload this page.',
      );
      return;
    }
    setState('denied');
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDecide = async (email: string, approve: boolean) => {
    if (!currentUser) return;
    setBusyEmail(email);
    try {
      await decideRequest(currentUser.email, email, approve);
      await loadLists(currentUser.email);
      toast({
        type: 'success',
        title: approve ? 'Organizer approved' : 'Request rejected',
        description: approve
          ? `${email} can now post events.`
          : `${email} remains an attendee.`,
      });
    } catch (err: unknown) {
      toast({
        type: 'error',
        title: 'Could not update the request',
        description: err instanceof Error ? err.message : 'Please try again.',
      });
    } finally {
      setBusyEmail(null);
    }
  };

  // Removes an approved organizer at any time. First click arms the
  // confirmation, second click confirms, so a stray tap cannot remove
  // someone by accident. The removed user becomes an attendee immediately
  // (their organizer pages and links stop working on their next navigation)
  // and may request access again afterwards.
  const handleRevoke = async (email: string) => {
    if (!currentUser) return;
    if (confirmRevokeEmail !== email) {
      setConfirmRevokeEmail(email);
      return;
    }
    setConfirmRevokeEmail(null);
    setBusyEmail(email);
    try {
      await revokeOrganizer(currentUser.email, email);
      setOrganizers((prev) => prev.filter((o) => o.email !== email));
      toast({
        type: 'success',
        title: 'Organizer removed',
        description: `${email} is now an attendee and can no longer post events.`,
      });
    } catch (err: unknown) {
      toast({
        type: 'error',
        title: 'Could not remove the organizer',
        description: err instanceof Error ? err.message : 'Please try again.',
      });
    } finally {
      setBusyEmail(null);
    }
  };

  if (state === 'loading') {
    return (
      <div className="max-w-3xl mx-auto px-4 py-20 space-y-4">
        <Skeleton className="h-8 w-56 mx-auto" />
        <Skeleton className="h-4 w-80 max-w-full mx-auto" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (state === 'guest' || state === 'denied') {
    return (
      <div className="max-w-lg mx-auto px-4 py-20 text-center space-y-4">
        <div className="w-12 h-12 bg-[#EAF1ED] text-[#1E3F35] rounded-xl flex items-center justify-center mx-auto">
          <ShieldAlert className="w-6 h-6" />
        </div>
        <h2 className="font-editorial text-2xl font-bold text-[#1E2320]">
          Admins only
        </h2>
        <p className="text-sm text-[#5F635D]">
          This page is only available to Locora admins. If you need organizer
          access, request it from your profile page instead.
        </p>
        <Link
          to="/profile"
          className="inline-flex px-4 py-2 bg-[#1E3F35] text-white rounded-lg text-xs font-semibold hover:bg-[#163028] transition-colors"
        >
          Go to Profile
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      <div className="pb-4 border-b border-[#E5E1D8]">
        <h1 className="font-editorial text-3xl font-bold tracking-tight text-[#1E2320]">
          Admin — Organizer Requests
        </h1>
        <p className="text-sm text-[#5F635D] mt-1">
          Approve or reject requests to become an organizer. Approved users
          can post events; everyone else stays an attendee.
        </p>
      </div>

      {error && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800">
          {error}
        </div>
      )}

      <div>
        <h2 className="font-editorial text-xl font-bold text-[#1E2320] mb-2">
          Pending Requests
        </h2>
        <div className="bg-white rounded-2xl border border-[#E5E1D8] shadow-xs divide-y divide-[#EBE7DF]">
        {pending.length === 0 ? (
          <p className="p-6 text-sm text-[#5F635D]">
            No pending organizer requests right now.
          </p>
        ) : (
          pending.map((req) => (
            <div
              key={req.email}
              className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
            >
              <div>
                <p className="text-sm font-semibold text-[#1E2320]">
                  {req.name || req.email}
                </p>
                <p className="text-xs text-[#5F635D]">{req.email}</p>
                {req.requestedAt && (
                  <p className="text-[11px] text-[#8C887E] mt-0.5">
                    Requested {new Date(req.requestedAt).toLocaleString()}
                  </p>
                )}
              </div>
              <div className="flex gap-2 shrink-0">
                <button
                  type="button"
                  disabled={busyEmail === req.email}
                  onClick={() => handleDecide(req.email, true)}
                  className="flex items-center gap-1.5 px-4 py-2 bg-[#1E3F35] hover:bg-[#163028] text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5" />
                  Approve
                </button>
                <button
                  type="button"
                  disabled={busyEmail === req.email}
                  onClick={() => handleDecide(req.email, false)}
                  className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 border border-rose-200 rounded-lg transition-colors cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                  Reject
                </button>
              </div>
            </div>
          ))
        )}
        </div>
      </div>

      <div>
        <h2 className="font-editorial text-xl font-bold text-[#1E2320] mb-2">
          Approved Organizers
        </h2>
        <p className="text-xs text-[#5F635D] mb-2">
          Remove an organizer at any time. They immediately go back to being
          an attendee and can no longer post events, and they may request
          access again afterwards.
        </p>
        <div className="bg-white rounded-2xl border border-[#E5E1D8] shadow-xs divide-y divide-[#EBE7DF]">
          {organizers.length === 0 ? (
            <p className="p-6 text-sm text-[#5F635D]">
              No approved organizers yet. Approvals from the pending list
              above will appear here.
            </p>
          ) : (
            organizers.map((org) => (
              <div
                key={org.email}
                className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div>
                  <p className="text-sm font-semibold text-[#1E2320]">
                    {org.name || org.email}
                  </p>
                  <p className="text-xs text-[#5F635D]">{org.email}</p>
                  {org.approvedAt && (
                    <p className="text-[11px] text-[#8C887E] mt-0.5">
                      Approved {new Date(org.approvedAt).toLocaleString()}
                    </p>
                  )}
                </div>
                <div className="flex gap-2 shrink-0">
                  {confirmRevokeEmail === org.email ? (
                    <>
                      <button
                        type="button"
                        disabled={busyEmail === org.email}
                        onClick={() => handleRevoke(org.email)}
                        className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                      >
                        Remove for sure?
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmRevokeEmail(null)}
                        className="px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 border border-slate-200 rounded-lg transition-colors cursor-pointer"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      disabled={busyEmail === org.email}
                      onClick={() => handleRevoke(org.email)}
                      className="px-4 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 border border-rose-200 rounded-lg transition-colors cursor-pointer"
                    >
                      Remove Organizer
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
