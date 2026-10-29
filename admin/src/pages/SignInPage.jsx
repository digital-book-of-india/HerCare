import React, { useState } from 'react';
import { login } from '../services/api';
import { HeartHandshake, ShieldCheck, Lock, Mail, AlertCircle, ArrowRight } from 'lucide-react';

export default function SignInPage({ onLoginSuccess }) {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!identifier || !password) {
      setError('Please enter both email address and password.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await login(identifier, password);
      onLoginSuccess(res.admin);
    } catch (err) {
      if (err.status === 429 || err.code === 'RATE_LIMITED') {
        setError('Too many failed attempts. Account locked for 15 minutes. Please try again later.');
      } else if (err.status === 401 || err.code === 'UNAUTHORIZED') {
        setError('Invalid admin credentials. Please verify your email and password.');
      } else {
        setError(err.message || 'Failed to sign in. Please check backend connection.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleFillDevCredentials = () => {
    setIdentifier(import.meta.env.VITE_DEFAULT_ADMIN_EMAIL || 'admin@hercare.local');
    setPassword('rq0Cuc6D9XkHBXKr');
    setError(null);
  };

  return (
    <div className="signin-wrapper">
      <div className="signin-card">
        {/* Header Branding */}
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <div
            style={{
              width: '52px',
              height: '52px',
              background: 'linear-gradient(135deg, #e11d48, #be123c)',
              borderRadius: '14px',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              boxShadow: '0 4px 12px rgba(225, 29, 72, 0.35)',
              marginBottom: '14px',
            }}
          >
            <HeartHandshake size={28} strokeWidth={2.4} />
          </div>
          <h1 style={{ fontSize: '1.45rem', fontWeight: 800, color: 'var(--text-main)', letterSpacing: '-0.02em' }}>
            HerCare Admin Portal
          </h1>
          <p style={{ fontSize: '0.86rem', color: 'var(--text-muted)', marginTop: '4px' }}>
            Sign in to manage clinical tips, texts, and system settings
          </p>
        </div>

        {/* Error Alert */}
        {error && (
          <div
            style={{
              background: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: 'var(--radius-md)',
              padding: '12px 14px',
              marginBottom: '20px',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '10px',
            }}
          >
            <AlertCircle size={18} color="#dc2626" style={{ marginTop: '2px', flexShrink: 0 }} />
            <div style={{ fontSize: '0.84rem', color: '#991b1b', lineHeight: '1.4' }}>
              {error}
            </div>
          </div>
        )}

        {/* Sign In Form */}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Admin Email Address</label>
            <div style={{ position: 'relative' }}>
              <input
                type="email"
                className="form-input"
                placeholder="admin@hercare.local"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                disabled={loading}
                autoComplete="email"
                required
                style={{ paddingLeft: '38px' }}
              />
              <Mail
                size={16}
                color="var(--text-muted)"
                style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }}
              />
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: '22px' }}>
            <label className="form-label">Password</label>
            <div style={{ position: 'relative' }}>
              <input
                type="password"
                className="form-input"
                placeholder="••••••••••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                autoComplete="current-password"
                required
                style={{ paddingLeft: '38px' }}
              />
              <Lock
                size={16}
                color="var(--text-muted)"
                style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }}
              />
            </div>
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: '100%', padding: '12px' }}
            disabled={loading}
          >
            {loading ? 'Authenticating...' : (
              <>
                <span>Sign In to Admin</span>
                <ArrowRight size={16} />
              </>
            )}
          </button>
        </form>

        {/* Development Quick-fill */}
        <div style={{ marginTop: '20px', paddingTop: '18px', borderTop: '1px solid var(--border)' }}>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={handleFillDevCredentials}
            style={{ width: '100%', fontSize: '0.78rem' }}
          >
            Pre-fill Default Admin Credentials (admin@hercare.local)
          </button>
        </div>

        {/* Privacy & Security Footnote */}
        <div
          style={{
            marginTop: '20px',
            fontSize: '0.75rem',
            color: 'var(--text-muted)',
            textAlign: 'center',
            lineHeight: '1.4',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
          }}
        >
          <ShieldCheck size={14} color="#059669" />
          <span>Strict Zero-PII Policy: Aggregates only. No individual health logs.</span>
        </div>
      </div>
    </div>
  );
}
