import React from 'react';
import { useLocation } from 'react-router-dom';

// Catches a render crash in any page and shows a readable card instead
// of a blank white page. Without this, one bad identifier (the
// Attendees page once rendered an `evt` variable that only existed
// inside its data loader) unmounts the whole React tree — navbar,
// footer and all — and the user sees nothing at all.
//
// The boundary resets on every route change (keyed by pathname), so a
// crash on one page does not poison navigation to every other page.

type Props = {
  children: React.ReactNode;
};

type State = {
  hasError: boolean;
  message: string;
};

class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false, message: '' };

  static getDerivedStateFromError(err: unknown): State {
    return {
      hasError: true,
      message: err instanceof Error ? err.message : 'Unknown error',
    };
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="max-w-md mx-auto px-4 py-20 text-center space-y-4">
        <h2 className="font-editorial text-2xl font-bold text-[#1E2320]">
          Something went wrong on this page
        </h2>
        <p className="text-sm text-[#5F635D]">
          Locora hit an unexpected error instead of showing this page.
          Reloading usually fixes it — if it keeps happening, please tell
          us which page you were opening.
        </p>
        {this.state.message && (
          <p className="text-[11px] text-[#8C887E] break-words">{this.state.message}</p>
        )}
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="px-5 py-2.5 bg-[#1E3F35] hover:bg-[#163028] text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
        >
          Reload page
        </button>
      </div>
    );
  }
}

export function PageErrorBoundary({ children }: Props) {
  const { pathname } = useLocation();
  return <ErrorBoundary key={pathname}>{children}</ErrorBoundary>;
}
