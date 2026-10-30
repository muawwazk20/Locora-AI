import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import { authService } from '../services/auth-service';

// Signing out is local: Locora sessions live only in this browser's
// storage (there is no server session to revoke), so this page signs
// out the device that opens it — which is exactly what the sign-in
// alert email's "Sign out" link needs. It cannot sign out some other
// device remotely; that would need server-side sessions.
export function LogoutPage() {
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    authService.logout().catch(() => {});
  }, []);

  return (
    <div className="max-w-md mx-auto px-4 py-16 space-y-6">
      <div className="bg-white p-8 rounded-2xl border border-[#E5E1D8] text-center space-y-4 shadow-xs">
        <div className="w-12 h-12 bg-[#EAF1ED] text-[#1E3F35] rounded-xl flex items-center justify-center mx-auto">
          <LogOut className="w-6 h-6" />
        </div>
        <h1 className="font-editorial text-lg font-bold text-[#1E2320]">Signed out</h1>
        <p className="text-xs text-[#5F635D] leading-relaxed">
          You&apos;ve been signed out of Locora on this device. If you opened
          this link from a sign-in alert about a device you don&apos;t
          recognize, change your password as well.
        </p>
        <div className="flex items-center justify-center gap-3">
          <Link
            to="/login"
            className="inline-block px-5 py-2.5 bg-[#1E3F35] hover:bg-[#163028] text-white text-xs font-semibold rounded-lg transition-colors"
          >
            Sign In
          </Link>
          <Link
            to="/forgot-password"
            className="inline-block px-5 py-2.5 border border-[#1E3F35] text-[#1E3F35] text-xs font-semibold rounded-lg transition-colors"
          >
            Change Password
          </Link>
        </div>
      </div>
    </div>
  );
}
