import React from 'react';
import { CalendarX, Search, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';

export function EventCardSkeleton() {
  return (
    <div className="bg-white rounded-xl border border-[#E5E1D8] overflow-hidden animate-pulse">
      <div className="aspect-[4/3] bg-[#EBE7DF]" />
      <div className="p-5 space-y-3">
        <div className="h-4 bg-[#EBE7DF] rounded w-1/3" />
        <div className="h-5 bg-[#EBE7DF] rounded w-4/5" />
        <div className="h-4 bg-[#EBE7DF] rounded w-2/3" />
        <div className="pt-2 border-t border-[#EBE7DF] flex items-center justify-between">
          <div className="h-4 bg-[#EBE7DF] rounded w-1/4" />
          <div className="h-4 bg-[#EBE7DF] rounded w-1/4" />
        </div>
      </div>
    </div>
  );
}

export function EventListSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {Array.from({ length: count }).map((_, i) => (
        <EventCardSkeleton key={i} />
      ))}
    </div>
  );
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div aria-hidden="true" className={`animate-pulse bg-[#EBE7DF] rounded ${className}`} />;
}

export function EventDetailsSkeleton() {
  return (
    <div className="max-w-5xl mx-auto px-4 py-8 animate-pulse space-y-6">
      <div className="h-4 w-24 bg-[#EBE7DF] rounded" />
      <div className="h-80 bg-[#EBE7DF] rounded-2xl" />
      <div className="grid md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-3">
          <div className="h-8 w-2/3 bg-[#EBE7DF] rounded" />
          <div className="h-4 w-1/3 bg-[#EBE7DF] rounded" />
          <div className="h-4 w-full bg-[#EBE7DF] rounded" />
          <div className="h-4 w-full bg-[#EBE7DF] rounded" />
          <div className="h-4 w-5/6 bg-[#EBE7DF] rounded" />
        </div>
        <div className="bg-white border border-[#E5E1D8] rounded-2xl p-5 space-y-3">
          <div className="h-6 w-1/2 bg-[#EBE7DF] rounded" />
          <div className="h-10 w-full bg-[#EBE7DF] rounded-lg" />
          <div className="h-4 w-2/3 bg-[#EBE7DF] rounded" />
        </div>
      </div>
    </div>
  );
}

export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="bg-white rounded-xl border border-[#E5E1D8] overflow-hidden animate-pulse">
      <div className="h-10 bg-[#FAF8F5] border-b border-[#EBE7DF]" />
      <div className="divide-y divide-[#EBE7DF]">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-5 py-4">
            <div className="h-10 w-10 bg-[#EBE7DF] rounded-lg shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-1/3 bg-[#EBE7DF] rounded" />
              <div className="h-3 w-1/4 bg-[#EBE7DF] rounded" />
            </div>
            <div className="h-4 w-16 bg-[#EBE7DF] rounded hidden sm:block" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function ListSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="space-y-3 animate-pulse">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bg-white rounded-xl border border-[#E5E1D8] p-5 flex items-center gap-4">
          <div className="h-16 w-16 bg-[#EBE7DF] rounded-lg shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-1/4 bg-[#EBE7DF] rounded" />
            <div className="h-5 w-1/2 bg-[#EBE7DF] rounded" />
            <div className="h-3 w-2/3 bg-[#EBE7DF] rounded" />
          </div>
          <div className="h-8 w-20 bg-[#EBE7DF] rounded-lg hidden md:block" />
        </div>
      ))}
    </div>
  );
}

export function FormSkeleton() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-8 animate-pulse space-y-6">
      <div className="h-8 w-1/3 bg-[#EBE7DF] rounded" />
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="space-y-2">
          <div className="h-3 w-24 bg-[#EBE7DF] rounded" />
          <div className="h-11 w-full bg-[#EBE7DF] rounded-lg" />
        </div>
      ))}
      <div className="h-11 w-32 bg-[#EBE7DF] rounded-lg" />
    </div>
  );
}

export function ProfileSkeleton() {
  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-8">
      <div className="flex items-center gap-5 animate-pulse">
        <div className="h-20 w-20 bg-[#EBE7DF] rounded-full shrink-0" />
        <div className="space-y-2 flex-1">
          <div className="h-6 w-48 bg-[#EBE7DF] rounded" />
          <div className="h-4 w-64 bg-[#EBE7DF] rounded" />
          <div className="h-4 w-32 bg-[#EBE7DF] rounded" />
        </div>
      </div>
      <EventListSkeleton count={3} />
    </div>
  );
}

export function StatCardsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 animate-pulse">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bg-white rounded-xl border border-[#E5E1D8] p-5 space-y-2">
          <div className="h-8 w-16 bg-[#EBE7DF] rounded" />
          <div className="h-3 w-20 bg-[#EBE7DF] rounded" />
        </div>
      ))}
    </div>
  );
}

interface EmptyStateProps {
  title: string;
  description: string;
  actionLabel?: string;
  actionHref?: string;
  onAction?: () => void;
  icon?: 'search' | 'calendar' | 'sparkles';
}

export function EmptyState({
  title,
  description,
  actionLabel,
  actionHref,
  onAction,
  icon = 'calendar',
}: EmptyStateProps) {
  const IconComponent = {
    search: Search,
    calendar: CalendarX,
    sparkles: Sparkles,
  }[icon];

  return (
    <div className="flex flex-col items-center justify-center text-center p-12 bg-white rounded-2xl border border-dashed border-[#E5E1D8] my-6">
      <div className="w-12 h-12 rounded-xl bg-[#F4F1EA] flex items-center justify-center text-[#1E3F35] mb-4">
        <IconComponent className="w-6 h-6" />
      </div>
      <h3 className="font-editorial text-lg font-bold text-[#1E2320]">{title}</h3>
      <p className="text-sm text-[#5F635D] mt-1 max-w-sm leading-relaxed">{description}</p>
      {(actionLabel && actionHref) && (
        <Link
          to={actionHref}
          className="mt-5 px-4 py-2 text-xs font-semibold text-white bg-[#1E3F35] rounded-lg hover:bg-[#163028] transition-colors whitespace-nowrap cursor-pointer"
        >
          {actionLabel}
        </Link>
      )}
      {(actionLabel && onAction && !actionHref) && (
        <button
          onClick={onAction}
          className="mt-5 px-4 py-2 text-xs font-semibold text-white bg-[#1E3F35] rounded-lg hover:bg-[#163028] transition-colors whitespace-nowrap cursor-pointer"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
