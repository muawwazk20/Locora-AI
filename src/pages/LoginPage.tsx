import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Lock, Mail } from 'lucide-react';
import { authService } from '../services/auth-service';
import { useToast } from '../components/ui/Toast';
import { GoogleAuthButton } from '../components/auth/GoogleAuthButton';

export function LoginPage() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      setError('Please provide your email and password.');
      return;
    }
    setError('');
    setLoading(true);

    try {
      const user = await authService.login(email.trim(), password);
      toast({
        type: 'success',
        title: `Signed in as ${user.name}`,
        description: `Welcome back to Locora (${user.role} role).`,
      });
      if (user.role === 'admin') {
        navigate('/admin');
      } else if (user.role === 'organizer') {
        navigate('/organizer/dashboard');
      } else {
        navigate('/dashboard');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Invalid credentials');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto px-4 py-12 sm:py-16 space-y-6">
      {/* Brand & Heading */}
      <div className="text-center space-y-2">
        <Link to="/" className="font-editorial text-3xl font-black tracking-tight text-[#1E2320] inline-block hover:text-[#1E3F35] transition-colors">
          Locora
        </Link>
        <h1 className="font-editorial text-2xl font-bold text-[#1E2320]">Sign in to your account</h1>
        <p className="text-xs text-[#5F635D]">
          Access your event tickets and saved gatherings.
        </p>
      </div>

      {/* Login Form */}
      <p className="p-3 bg-[#FFF8E6] border border-[#F0E3B8] rounded-xl text-xs text-[#5F4A00]">Security update: old demo accounts no longer work. If you signed up before this update, please sign up again with the same email — your new account starts as an attendee.</p>
      <form
        onSubmit={handleSubmit}
        className="bg-white p-6 sm:p-8 rounded-2xl border border-[#E5E1D8] shadow-xs space-y-4"
      >
        {error && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700">
            {error}
          </div>
        )}

        <div>
          <label className="block text-xs font-semibold text-[#1E2320] mb-1.5">
            Email Address
          </label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8C887E]" />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              className="w-full pl-9 pr-3 py-2.5 text-xs bg-white border border-[#E2DFD8] rounded-lg text-[#1E2320] focus:border-[#1E3F35]"
            />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-semibold text-[#1E2320]">Password</label>
            <Link
              to="/forgot-password"
              className="text-[11px] text-[#1E3F35] hover:underline"
            >
              Forgot password?
            </Link>
          </div>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8C887E]" />
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              required
              className="w-full pl-9 pr-10 py-2.5 text-xs bg-white border border-[#E2DFD8] rounded-lg text-[#1E2320] focus:border-[#1E3F35]"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8C887E] hover:text-[#1E2320] p-0.5"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-2.5 bg-[#1E3F35] hover:bg-[#163028] text-white text-xs font-semibold rounded-lg transition-colors shadow-xs cursor-pointer"
        >
          {loading ? 'Authenticating...' : 'Sign In with Email'}
        </button>

        <div className="relative my-4 flex items-center justify-center">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-[#E5E1D8]" />
          </div>
          <span className="relative bg-white px-2 text-[11px] uppercase tracking-wider text-[#8C887E]">
            or continue with
          </span>
        </div>

        <GoogleAuthButton
          buttonText="Sign In with Google"
          disabled={loading}
          onSuccess={(user) => {
            toast({
              type: 'success',
              title: `Signed in as ${user.name}`,
              description: 'Welcome back to Locora!',
            });
            if (user.role === 'admin') {
              navigate('/admin');
            } else if (user.role === 'organizer') {
              navigate('/organizer/dashboard');
            } else {
              navigate('/dashboard');
            }
          }}
          onError={(msg) => {
            setError(msg);
          }}
        />
      </form>

      <p className="text-center text-xs text-[#5F635D]">
        Don't have an account?{' '}
        <Link to="/signup" className="text-[#1E3F35] font-semibold hover:underline">
          Sign up
        </Link>
      </p>
    </div>
  );
}
