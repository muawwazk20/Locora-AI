import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Search, Download, CheckCircle, Clock, XCircle, Users } from 'lucide-react';
import { AttendeeRegistration, EventItem } from '../types';
import { eventsService, canManageEvent } from '../services/events-service';
import { authService } from '../services/auth-service';
import { isAdminEmail } from '../services/roles-service';
import { registrationsService } from '../services/registrations-service';
import { formatEventDate } from '../utils/formatters';
import { useToast } from '../components/ui/Toast';
import { TableSkeleton } from '../components/ui/LoadingSkeleton';

export function AttendeesPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const { toast } = useToast();
  const currentUser = authService.getCurrentUser();

  const [event, setEvent] = useState<EventItem | null>(null);
  const [attendees, setAttendees] = useState<AttendeeRegistration[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'confirmed' | 'checked_in'>('all');
  const [busyId, setBusyId] = useState<string | null>(null);
  // True when the event belongs to another organizer. The attendee list
  // is never loaded or shown in that case.
  const [notOwner, setNotOwner] = useState(false);

  useEffect(() => {
    async function loadData() {
      if (!eventId) return;
      setLoading(true);
      try {
        // The event and its attendee list do not depend on each other,
        // so fetch both at once instead of stacking two ~2s calls.
        const [evt, list] = await Promise.all([
          eventsService.getEventById(eventId),
          registrationsService.getEventAttendees(eventId),
        ]);
        setEvent(evt);
        if (!evt) return;
        const currentUser = authService.getCurrentUser();
        const isAdmin =
          !!currentUser &&
          currentUser.role === 'admin' &&
          isAdminEmail(currentUser.email);
        if (!canManageEvent(evt, currentUser?.email, isAdmin)) {
          setNotOwner(true);
          return;
        }
        setAttendees(list);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [eventId]);

  const handleApprove = async (reg: AttendeeRegistration) => {
    const email = currentUser?.email;
    if (!email) return;
    setBusyId(reg.id);
    try {
      const updated = await registrationsService.approveRegistration(reg.id, email);
      setAttendees((prev) => prev.map((a) => (a.id === reg.id ? updated : a)));
      toast({
        type: 'success',
        title: 'Payment approved',
        description: `${reg.userName}'s pass ${updated.ticketCode} is now active.`,
      });
    } catch (err: unknown) {
      toast({
        type: 'error',
        title: 'Could not approve payment',
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setBusyId(null);
    }
  };

  const handleReject = async (reg: AttendeeRegistration) => {
    const email = currentUser?.email;
    if (!email) return;
    setBusyId(reg.id);
    try {
      const updated = await registrationsService.rejectRegistration(reg.id, email);
      setAttendees((prev) => prev.map((a) => (a.id === reg.id ? updated : a)));
      toast({
        type: 'info',
        title: 'Payment rejected',
        description: `${reg.userName}'s payment request was rejected.`,
      });
    } catch {
      toast({ type: 'error', title: 'Could not reject payment' });
    } finally {
      setBusyId(null);
    }
  };

  const handleToggleCheckIn = async (regId: string) => {
    try {
      const updated = await registrationsService.toggleCheckIn(regId, currentUser?.email);
      setAttendees((prev) => prev.map((a) => (a.id === regId ? updated : a)));
      toast({
        type: 'success',
        title: updated.checkedIn ? 'Attendee Checked In' : 'Check-In Reverted',
        description: `${updated.userName} marked as ${updated.checkedIn ? 'present' : 'pending'}.`,
      });
    } catch {
      toast({ type: 'error', title: 'Could not toggle check-in' });
    }
  };

  // Pending payments live in their own section below; the roster table
  // (and its export) covers confirmed and rejected registrations only.
  const pendingRegs = attendees.filter((a) => a.status === 'pending');
  const tableAttendees = attendees.filter((a) => a.status !== 'pending');
  // Pending / approved / total split for the summary line. Approved
  // here is the true confirmed count from the roster, not the stored
  // event count (legacy pending rows were counted in that number).
  const approvedCount = attendees.filter((a) => a.status === 'confirmed').length;

  const handleExportCSV = () => {
    if (tableAttendees.length === 0) {
      toast({ type: 'info', title: 'No attendees to export' });
      return;
    }
    const headers = ['Registration ID', 'Name', 'Email', 'Phone', 'Ticket Code', 'Status', 'Checked In'];
    const rows = tableAttendees.map((a) => [
      a.id,
      `"${a.userName}"`,
      `"${a.userEmail}"`,
      `"${a.userPhone || ''}"`,
      a.ticketCode,
      a.status,
      a.checkedIn ? 'Yes' : 'No',
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `attendees_${eventId}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast({
      type: 'success',
      title: 'CSV Exported',
      description: 'Attendee roster exported to your downloads folder.',
    });
  };

  const filtered = tableAttendees.filter((a) => {
    const q = searchQuery.toLowerCase().trim();
    const matchesSearch =
      !q ||
      a.userName.toLowerCase().includes(q) ||
      a.userEmail.toLowerCase().includes(q) ||
      (a.userPhone || '').toLowerCase().includes(q) ||
      a.ticketCode.toLowerCase().includes(q);

    if (!matchesSearch) return false;
    if (statusFilter === 'confirmed') return a.status === 'confirmed';
    if (statusFilter === 'checked_in') return a.checkedIn;
    return true;
  });

  const checkedInCount = attendees.filter((a) => a.checkedIn).length;

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <TableSkeleton rows={6} />
      </div>
    );
  }

  if (!event) {
    return (
      <div className="max-w-md mx-auto px-4 py-20 text-center space-y-4">
        <h2 className="text-xl font-bold text-slate-900">Event Not Found</h2>
        <Link to="/organizer/events" className="text-xs font-semibold text-indigo-600 underline">
          Back to Events
        </Link>
      </div>
    );
  }

  if (notOwner) {
    return (
      <div className="max-w-md mx-auto px-4 py-20 text-center space-y-4">
        <h2 className="font-editorial text-2xl font-bold text-[#1E2320]">
          This event belongs to another organizer
        </h2>
        <p className="text-sm text-[#5F635D]">
          Only the event's own organizer (and admins) can view its attendee
          list.
        </p>
        <Link to="/organizer/events" className="text-xs font-semibold text-[#1E3F35] hover:underline">
          Back to Events
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Back button */}
      <Link
        to="/organizer/events"
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-900 transition-colors"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        <span>Back to Events Management</span>
      </Link>

      {/* Header Banner */}
      <div className="bg-white rounded-2xl border border-[#E5E1D8] p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs">
        <div>
          <span className="text-[11px] font-bold text-[#1E3F35] uppercase tracking-wider">
            Attendee Roster
          </span>
          <h1 className="font-editorial text-xl sm:text-2xl font-bold tracking-tight text-[#1E2320] mt-0.5">
            {event.title}
          </h1>
          <p className="text-xs text-[#5F635D] mt-1">
            {formatEventDate(event.startDate)} · {event.venueName}
          </p>
        </div>

        <button
          onClick={handleExportCSV}
          className="flex items-center gap-1.5 px-4 py-2 bg-[#1E3F35] hover:bg-[#163028] text-white text-xs font-semibold rounded-lg transition-colors whitespace-nowrap self-start sm:self-auto cursor-pointer"
        >
          <Download className="w-4 h-4" />
          <span>Export CSV</span>
        </button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 bg-white rounded-xl border border-[#E5E1D8] shadow-2xs">
          <span className="text-xs text-[#5F635D] font-medium">Registered Attendees</span>
          <p className="font-editorial text-2xl font-bold text-[#1E2320] tabular-nums mt-0.5">
            {event.registeredCount} / {event.capacity}
          </p>
        </div>

        <div className="p-4 bg-white rounded-xl border border-[#E5E1D8] shadow-2xs">
          <span className="text-xs text-[#5F635D] font-medium">Checked In</span>
          <p className="font-editorial text-2xl font-bold text-[#1E3F35] tabular-nums mt-0.5">
            {checkedInCount}
          </p>
        </div>

        <div className="p-4 bg-white rounded-xl border border-[#E5E1D8] shadow-2xs">
          <span className="text-xs text-[#5F635D] font-medium">Capacity Remaining</span>
          <p className="font-editorial text-2xl font-bold text-[#1E3F35] tabular-nums mt-0.5">
            {Math.max(0, event.capacity - event.registeredCount)}
          </p>
        </div>
      </div>

      {/* Pending / approved / total split. */}
      <p className="text-xs text-[#5F635D]">
        {approvedCount} approved · {pendingRegs.length} pending · {event.capacity} total spots
      </p>

      {/* Pending payment approvals — manual-approval flow for paid events.
          Approve issues the pass and takes a spot; reject frees a held
          spot (new pending requests hold none). */}
      {pendingRegs.length > 0 && (
        <div className="bg-amber-50/60 rounded-2xl border border-amber-200 p-5 space-y-3 shadow-xs">
          <h2 className="font-editorial text-base font-bold text-[#1E2320]">
            Pending payment approvals ({pendingRegs.length})
          </h2>
          <p className="text-xs text-[#5F635D]">
            These attendees paid and submitted a UTR. Verify each payment in your bank or UPI app, then approve to issue their pass — or reject to release the spot.
          </p>
          <div className="space-y-2">
            {pendingRegs.map((reg) => (
              <div
                key={reg.id}
                className="bg-white rounded-xl border border-[#E5E1D8] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="text-xs space-y-0.5">
                  <p className="font-semibold text-[#1E2320] text-sm">{reg.userName}</p>
                  <p className="text-[#5F635D]">{reg.userEmail}</p>
                  {reg.userPhone && (
                    <p className="text-[#5F635D]">
                      Mobile: <span className="font-semibold text-[#1E2320]">{reg.userPhone}</span>
                      {reg.phoneVerified && (
                        <span className="text-[#1E3F35] font-semibold"> ✓ Verified</span>
                      )}
                    </p>
                  )}
                  <p className="text-[#5F635D]">
                    UTR: <span className="font-mono font-semibold text-[#1E2320]">{reg.utr || '—'}</span>
                    <span aria-hidden="true"> · </span>
                    {formatEventDate(reg.registeredAt)}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    disabled={
                      busyId === reg.id ||
                      (event.registeredCount >= event.capacity && reg.holdsSpot === false)
                    }
                    title={
                      event.registeredCount >= event.capacity && reg.holdsSpot === false
                        ? 'Event is at full capacity — free a spot before approving'
                        : undefined
                    }
                    onClick={() => handleApprove(reg)}
                    className="px-3.5 py-2 text-xs font-semibold text-white bg-[#1E3F35] hover:bg-[#163028] rounded-lg transition-colors disabled:opacity-60"
                  >
                    Approve & Issue Pass
                  </button>
                  <button
                    type="button"
                    disabled={busyId === reg.id}
                    onClick={() => handleReject(reg)}
                    className="px-3.5 py-2 text-xs font-medium text-rose-600 hover:bg-rose-50 border border-rose-200 rounded-lg transition-colors disabled:opacity-60"
                  >
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Search & Filter Toolbar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8C887E]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by attendee name or pass code..."
            className="w-full pl-9 pr-3 py-2 text-xs bg-white border border-[#E2DFD8] rounded-lg text-[#1E2320] focus:border-[#1E3F35]"
          />
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
              statusFilter === 'all'
                ? 'bg-[#1E3F35] text-white font-semibold'
                : 'bg-white border border-[#E2DFD8] text-[#5F635D]'
            }`}
          >
            All ({tableAttendees.length})
          </button>
          <button
            onClick={() => setStatusFilter('confirmed')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
              statusFilter === 'confirmed'
                ? 'bg-[#1E3F35] text-white font-semibold'
                : 'bg-white border border-[#E2DFD8] text-[#5F635D]'
            }`}
          >
            Confirmed
          </button>
          <button
            onClick={() => setStatusFilter('checked_in')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
              statusFilter === 'checked_in'
                ? 'bg-[#1E3F35] text-white font-semibold'
                : 'bg-white border border-[#E2DFD8] text-[#5F635D]'
            }`}
          >
            Checked In ({checkedInCount})
          </button>
        </div>
      </div>

      {/* Attendee Roster Table */}
      <div className="bg-white rounded-2xl border border-[#E5E1D8] overflow-hidden shadow-xs">
        {filtered.length === 0 ? (
          <div className="p-12 text-center text-xs text-[#5F635D]">
            No attendees matching your search criteria.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-[#EBE7DF] bg-[#FAF8F5] text-[#1E2320] font-semibold uppercase tracking-wider text-[11px]">
                  <th className="py-3 px-5">Attendee</th>
                  <th className="py-3 px-5">Ticket Pass Code</th>
                  <th className="py-3 px-5">Registered Date</th>
                  <th className="py-3 px-5">RSVP Status</th>
                  <th className="py-3 px-5 text-right">Venue Check-In</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EBE7DF]">
                {filtered.map((att) => (
                  <tr key={att.id} className="hover:bg-[#FAF8F5]/60 transition-colors">
                    <td className="py-3.5 px-5">
                      <p className="font-semibold text-[#1E2320]">{att.userName}</p>
                      <p className="text-[11px] text-[#8C887E]">{att.userEmail}</p>
                      {att.userPhone && (
                        <p className="text-[11px] text-[#8C887E]">{att.userPhone}</p>
                      )}
                      {att.phoneVerified && (
                        <p className="text-[11px] text-[#1E3F35] font-semibold">✓ Verified</p>
                      )}
                    </td>

                    <td className="py-3.5 px-5 font-mono text-[#1E2320] font-medium">
                      {att.ticketCode}
                    </td>

                    <td className="py-3.5 px-5 text-[#5F635D] tabular-nums">
                      {new Date(att.registeredAt).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </td>

                    <td className="py-3.5 px-5">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[11px] font-medium capitalize ${
                          att.status === 'confirmed'
                            ? 'bg-[#EAF1ED] text-[#1E3F35]'
                            : 'bg-rose-50 text-rose-700'
                        }`}
                      >
                        {att.status}
                      </span>
                    </td>

                    <td className="py-3.5 px-5 text-right">
                      <button
                        type="button"
                        onClick={() => handleToggleCheckIn(att.id)}
                        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                          att.checkedIn
                            ? 'bg-[#1E3F35] text-white'
                            : 'bg-[#F4F1EA] text-[#1E2320] border border-[#E2DFD8] hover:bg-[#EBE7DF]'
                        }`}
                      >
                        <CheckCircle className="w-3.5 h-3.5" />
                        <span>{att.checkedIn ? 'Checked In' : 'Mark Present'}</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
