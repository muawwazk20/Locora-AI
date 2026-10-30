import React, { useState } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { Lock, Eye, EyeOff } from 'lucide-react';
import { apiClient } from '../services/api-client';

// Reset-password page for the Finding 4 reset flow.
// Route wiring required (main agent, in App.tsx): /reset-password -> this page.
// The token comes only from the emailed link (?token=...); it is never
// stored in the page, and the server stores only its SHA-256 hash.
export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token') || '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!token) { setError('This reset link is missing its token. Request a new link from the sign-in page.'); return; }
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return; }
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    setError(''); setMessage(''); setLoading(true);
    try {
      const data = await apiClient.post<{ message?: string }>('/auth/reset', { action: 'confirm', token, newPassword: password });
      setMessage(data.message || 'Your password has been reset.');
      setTimeout(() => navigate('/login'), 1500);
    } catch (err: any) {
      setError(err?.message || 'This reset link is invalid or has expired.');
    } finally { setLoading(false); }
  }

  return (
    <div className="max-w-md mx-auto px-4 py-16 space-y-6">
      <div className="text-center space-y-2">
        <h1 className="font-editorial text-2xl font-bold text-[#1E2320]">Choose a new password</h1>
        <p className="text-xs text-[#5F635D]">This link expires in 1 hour and can only be used once.</p>
      </div>
      <form onSubmit={handleSubmit} className="bg-white p-6 sm:p-8 rounded-2xl border border-[#E5E1D8] shadow-xs space-y-4">
        {message && <div className="p-3 bg-[#EAF1ED] border border-[#D0E2D9] rounded-xl text-xs text-[#1E3F35]">{message}</div>}
        {error && <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700">{error}</div>}
        <div>
          <label className="block text-xs font-semibold text-[#1E2320] mb-1.5">New password</label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8C887E]" />
            <input type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 6 characters" required className="w-full pl-9 pr-10 py-2.5 text-xs bg-white border border-[#E2DFD8] rounded-lg text-[#1E2320] focus:border-[#1E3F35]" />
            <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8C887E] hover:text-[#1E2320] p-0.5" aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}</button>
          </div>
        </div>
        <div>
          <label className="block text-xs font-semibold text-[#1E2320] mb-1.5">Confirm new password</label>
          <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Repeat the new password" required className="w-full px-3 py-2.5 text-xs bg-white border border-[#E2DFD8] rounded-lg text-[#1E2320] focus:border-[#1E3F35]" />
        </div>
        <button type="submit" disabled={loading} className="w-full py-2.5 bg-[#1E3F35] hover:bg-[#163028] text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-60">{loading ? 'Resetting…' : 'Reset password'}</button>
      </form>
      <p className="text-center text-xs text-[#5F635D]"><Link to="/login" className="text-[#1E3F35] font-semibold hover:underline">Back to Sign In</Link></p>
    </div>
  );
}
