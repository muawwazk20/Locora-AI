import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, KeyRound, Chrome, Mail } from 'lucide-react';
import { apiClient } from '../services/api-client';

// SECURITY FIX — Phase 1 Finding 4: local accounts now DO have server
// passwords (scrypt hashes in locora_users), so this page is a real
// reset form, not the old "Locora doesn't send reset emails" note that
// contradicted the password field on /login. The server always answers
// the same generic message, whether or not an account exists, so this
// form cannot be used to enumerate accounts. Google accounts still
// reset via Google, because Locora does not hold their password.
export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) { setError('Please enter your email address.'); return; }
    setError(''); setMessage(''); setLoading(true);
    try {
      const data = await apiClient.post<{ message?: string }>('/auth/reset', { action: 'request', email: email.trim() });
      setMessage(data.message || 'If an account exists for that email, a reset link has been sent. It expires in 1 hour.');
    } catch (err: any) {
      setError(err?.message || 'Could not send a reset link. Please try again.');
    } finally { setLoading(false); }
  }

  return (
    <div className="max-w-md mx-auto px-4 py-16 space-y-6">
      <Link to="/login" className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#5F635D] hover:text-[#1E2320] transition-colors">
        <ArrowLeft className="w-3.5 h-3.5" />
        <span>Back to Sign In</span>
      </Link>
      <div className="text-center space-y-2">
        <h1 className="font-editorial text-2xl font-bold text-[#1E2320]">Reset your password</h1>
        <p className="text-xs text-[#5F635D]">Enter the email you signed up with. If an account exists, you will get a reset link that expires in 1 hour.</p>
      </div>
      <form onSubmit={handleSubmit} className="bg-white p-6 sm:p-8 rounded-2xl border border-[#E5E1D8] shadow-xs space-y-4">
        {message && <div className="p-3 bg-[#EAF1ED] border border-[#D0E2D9] rounded-xl text-xs text-[#1E3F35]">{message}</div>}
        {error && <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700">{error}</div>}
        <div>
          <label className="block text-xs font-semibold text-[#1E2320] mb-1.5">Email Address</label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8C887E]" />
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required className="w-full pl-9 pr-3 py-2.5 text-xs bg-white border border-[#E2DFD8] rounded-lg text-[#1E2320] focus:border-[#1E3F35]" />
          </div>
        </div>
        <button type="submit" disabled={loading} className="w-full py-2.5 bg-[#1E3F35] hover:bg-[#163028] text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-60">
          {loading ? 'Sending…' : 'Send reset link'}
        </button>
        <p className="text-[11px] text-[#5F635D]">Accounts created before the security update need to sign up again — old demo accounts no longer work (see the sign-in page note).</p>
      </form>
      <div className="bg-white p-6 sm:p-8 rounded-2xl border border-[#E5E1D8] shadow-xs space-y-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 bg-[#EAF1ED] text-[#1E3F35] rounded-xl flex items-center justify-center shrink-0"><Chrome className="w-5 h-5" /></div>
          <div className="space-y-1">
            <h2 className="font-editorial text-base font-bold text-[#1E2320]">I signed in with Google</h2>
            <p className="text-xs text-[#5F635D] leading-relaxed">Your password is managed by Google, not Locora. Reset it through Google&apos;s account recovery.</p>
          </div>
        </div>
        <a href="https://accounts.google.com/signin/recovery" target="_blank" rel="noreferrer" className="inline-block px-5 py-2.5 bg-[#1E3F35] hover:bg-[#163028] text-white text-xs font-semibold rounded-lg transition-colors">Reset via Google</a>
      </div>
      <p className="text-center text-[11px] text-[#5F635D]">Still stuck? Make sure you&apos;re using the same email address you signed up with.</p>
    </div>
  );
}
