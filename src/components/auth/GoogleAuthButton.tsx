import React, { useState } from 'react';
import { authService } from '../../services/auth-service';
import { UserProfile } from '../../types';
import { Loader2 } from 'lucide-react';

interface GoogleAuthButtonProps {
  // No role prop anymore: Google sign-in always starts as an attendee;
  // admin status comes from the admin email list in the callback, and
  // organizer status only from an admin approval. Nobody chooses a role
  // at sign-in.
  buttonText?: string;
  // Kept for compatibility with LoginPage/SignupPage. With the server-side
  // OAuth flow these callbacks are not called, because clicking the button
  // navigates away to Google and the callback page completes the sign-in.
  onSuccess: (user: UserProfile) => void;
  onError: (errorMsg: string) => void;
  disabled?: boolean;
}

// Google sign-in button for visitors.
//
// There is deliberately NO setup dialog and NO Client ID input here.
// Visitors must never be asked for a Google Client ID — that is a
// developer credential, not something a user should have or enter.
// Clicking this button redirects to /api/auth/google, a Vercel Serverless
// Function that uses GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET from Vercel
// environment variables only. Google then redirects back to
// /api/auth/google/callback, which signs the user in.
export function GoogleAuthButton({
  buttonText = 'Continue with Google',
  onSuccess: _onSuccess,
  onError: _onError,
  disabled = false,
}: GoogleAuthButtonProps) {
  const [loading, setLoading] = useState(false);

  const handleClick = () => {
    setLoading(true);
    // loginWithGoogle redirects the browser; it never resolves, because
    // the sign-in completes via the OAuth callback page.
    void authService.loginWithGoogle();
  };

  return (
    <div className="space-y-2">
      <button
        type="button"
        disabled={disabled || loading}
        onClick={handleClick}
        className="w-full py-2.5 px-4 bg-white hover:bg-[#F4F1EA] text-[#1E2320] border border-[#E2DFD8] text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-2.5 cursor-pointer shadow-2xs disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {loading ? (
          <>
            <Loader2 className="w-4 h-4 text-[#1E3F35] animate-spin" />
            <span>Connecting to Google...</span>
          </>
        ) : (
          <>
            <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
            <span>{buttonText}</span>
          </>
        )}
      </button>
    </div>
  );
}
