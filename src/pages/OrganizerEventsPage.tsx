import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { PlusCircle, Edit, Users, Trash2, Eye, EyeOff, ArrowLeft, Clock } from 'lucide-react';
import { EventItem } from '../types';
import { eventsService, isEventOwner, canManageEvent } from '../services/events-service';
import { registrationsService } from '../services/registrations-service';
import { authService } from '../services/auth-service';
import { isAdminEmail } from '../services/roles-service';
import { formatEventDate, formatPrice } from '../utils/formatters';
import { useToast } from '../components/ui/Toast';
import { ConfirmDialog } from '../components/ui/Modal';
import { ListSkeleton } from '../components/ui/LoadingSkeleton';

export function OrganizerEventsPage() {
  const { toast } = useToast();
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<'all' | 'published' | 'draft' | 'cancelled'>('all');

  const [deleteTarget, setDeleteTarget] = useState<EventItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  // Pending manual-approval payments per event (shared table only).
  const [pendingCounts, setPendingCounts] = useState<Record<string, number>>({});

  // Ownership for this list: an organizer sees only their own events;
  // admins see everything (they may delete and operate events, but not
  // edit details — the Edit button below is owner-only). The service
  // re-checks ownership on every edit/delete, so a filtered list alone
  // is not the protection.
  const currentUser = authService.getCurrentUser();
  const isAdmin =
    !!currentUser &&
    currentUser.role === 'admin' &&
    isAdminEmail(currentUser.email);
  const ownershipOpts = {
    ownerEmail: currentUser?.email,
    isAdmin,
  };

  const loadEvents = async () => {
    setLoading(true);
    try {
      const { data } = await eventsService.getEvents({}, 1, 100);
      setEvents(
        data.filter((e) => canManageEvent(e, currentUser?.email, isAdmin)),
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEvents();
    registrationsService.getPendingCounts().then(setPendingCounts).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleTogglePublish = async (event: EventItem) => {
    const newStatus = event.status === 'published' ? 'draft' : 'published';
    try {
      await eventsService.updateEvent(event.id, { status: newStatus }, { ...ownershipOpts, allowAdmin: true });
      setEvents((prev) =>
        prev.map((e) => (e.id === event.id ? { ...e, status: newStatus } : e))
      );
      toast({
        type: 'success',
        title: `Event ${newStatus === 'published' ? 'Published' : 'Moved to Draft'}`,
      });
    } catch {
      toast({ type: 'error', title: 'Failed to update event status' });
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await eventsService.deleteEvent(deleteTarget.id, ownershipOpts);
      setEvents((prev) => prev.filter((e) => e.id !== deleteTarget.id));
      setDeleteTarget(null);
      toast({
        type: 'info',
        title: 'Event Deleted',
        description: `"${deleteTarget.title}" was removed from the listings.`,
      });
    } catch {
      toast({ type: 'error', title: 'Failed to delete event' });
    } finally {
      setDeleting(false);
    }
  };

  const filtered = statusFilter === 'all' ? events : events.filter((e) => e.status === statusFilter);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#E5E1D8]">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link
              to="/organizer/dashboard"
              className="text-xs text-[#5F635D] hover:text-[#1E2320] inline-flex items-center gap-1"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Organizer Console</span>
            </Link>
          </div>
          <h1 className="font-editorial text-3xl font-bold tracking-tight text-[#1E2320]">
            Manage All Events
          </h1>
        </div>

        <Link
          to="/organizer/events/new"
          className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#1E3F35] hover:bg-[#163028] rounded-lg transition-colors whitespace-nowrap self-start sm:self-auto shadow-xs"
        >
          <PlusCircle className="w-4 h-4" />
          <span>New Event</span>
        </Link>
      </div>

      {/* Status Filter Tabs */}
      <div className="flex items-center gap-2">
        {(['all', 'published', 'draft', 'cancelled'] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg capitalize transition-colors ${
              statusFilter === s
                ? 'bg-[#1E3F35] text-white font-semibold'
                : 'bg-white text-[#5F635D] hover:text-[#1E2320] border border-[#E2DFD8]'
            }`}
          >
            {s} ({s === 'all' ? events.length : events.filter((e) => e.status === s).length})
          </button>
        ))}
      </div>

      {/* Events List Cards */}
      {loading ? (
        <ListSkeleton count={4} />
      ) : filtered.length === 0 ? (
        <div className="p-12 text-center bg-white rounded-2xl border border-dashed border-[#E5E1D8] text-xs text-[#5F635D]">
          No events found in this category.
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((evt) => (
            <div
              key={evt.id}
              className="bg-white rounded-xl border border-[#E5E1D8] p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-2xs hover:border-[#1E3F35]/30 transition-colors"
            >
              <div className="flex items-start gap-4">
                <img
                  src={evt.coverImage}
                  alt={evt.title}
                  referrerPolicy="no-referrer"
                  className="w-16 h-16 rounded-lg object-cover bg-[#F4F1EA] shrink-0 border border-[#E2DFD8]"
                />
                <div>
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#1E3F35] mb-1">
                    <span>{evt.category}</span>
                    <span aria-hidden="true" className="text-[#C8C4BC]">·</span>
                    <span className="text-[#5F635D] font-normal normal-case">{formatEventDate(evt.startDate)}</span>
                    <span aria-hidden="true" className="text-[#C8C4BC]">·</span>
                    <span className="font-semibold text-[#1E2320] font-normal">{formatPrice(evt.price)}</span>
                  </div>
                  <h3 className="font-editorial text-base font-bold text-[#1E2320]">
                    <Link to={`/events/${evt.id}`} className="hover:text-[#1E3F35]">
                      {evt.title}
                    </Link>
                  </h3>
                  <p className="text-xs text-[#5F635D] mt-0.5">
                    {evt.venueName} · {evt.registeredCount} / {evt.capacity} registered
                  </p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2 self-end md:self-center shrink-0">
                {pendingCounts[evt.id] ? (
                  <Link
                    to={`/organizer/events/${evt.id}/attendees`}
                    className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg transition-colors"
                  >
                    <Clock className="w-3 h-3" />
                    <span>{pendingCounts[evt.id]} pending</span>
                  </Link>
                ) : null}
                <Link
                  to={`/organizer/events/${evt.id}/attendees`}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#1E2320] hover:text-[#1E3F35] bg-[#F4F1EA] hover:bg-[#EBE7DF] border border-[#E2DFD8] rounded-lg transition-colors"
                >
                  <Users className="w-3.5 h-3.5 text-[#1E3F35]" />
                  <span>Roster</span>
                </Link>

                {isEventOwner(evt, currentUser?.email) && (
                  <Link
                    to={`/organizer/events/${evt.id}/edit`}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#1E2320] hover:text-[#1E3F35] bg-[#F4F1EA] hover:bg-[#EBE7DF] border border-[#E2DFD8] rounded-lg transition-colors"
                  >
                    <Edit className="w-3.5 h-3.5 text-[#8C887E]" />
                    <span>Edit</span>
                  </Link>
                )}

                <button
                  type="button"
                  onClick={() => handleTogglePublish(evt)}
                  className="p-1.5 text-[#5F635D] hover:text-[#1E2320] rounded-lg hover:bg-[#F4F1EA] transition-colors"
                  title={evt.status === 'published' ? 'Unpublish to draft' : 'Publish event'}
                >
                  {evt.status === 'published' ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4 text-[#1E3F35]" />
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setDeleteTarget(evt)}
                  className="p-1.5 text-[#8C887E] hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors"
                  title="Delete event"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDeleteConfirm}
        isLoading={deleting}
        isDestructive
        title="Delete Event"
        message={`Are you sure you want to permanently delete "${deleteTarget?.title}"? All registration records will be cancelled.`}
        confirmLabel="Yes, Delete Event"
      />
    </div>
  );
}
