import React, { useState } from 'react';
import { Truck, ShieldCheck, Lock, User, ArrowRight, AlertCircle } from 'lucide-react';

export default function LoginModal({ onLoginSuccess }) {
  const [username, setUsername] = useState('handler');
  const [password, setPassword] = useState('admin123');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Login failed');
      }

      localStorage.setItem('fleet_token', data.token);
      localStorage.setItem('fleet_user', JSON.stringify(data.user));
      onLoginSuccess(data.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh', width: '100%', display: 'flex', alignItems: 'center',
      justifyContent: 'center', backgroundColor: '#0f172a', padding: '16px', boxSizing: 'border-box'
    }}>
      <div style={{
        backgroundColor: '#ffffff', borderRadius: '16px', width: '100%',
        maxWidth: '440px', padding: '28px 24px', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)', boxSizing: 'border-box'
      }}>
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <div style={{
            width: '54px', height: '54px', borderRadius: '12px',
            background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            color: 'white', marginBottom: '16px', boxShadow: '0 8px 16px rgba(37, 99, 235, 0.3)'
          }}>
            <Truck size={28} />
          </div>
          <h2 style={{ fontSize: '22px', fontWeight: '800', color: '#0f172a', letterSpacing: '-0.5px' }}>
            FleetPulse
          </h2>
          <p style={{ fontSize: '13px', color: '#64748b', marginTop: '4px' }}>
            Vehicle Process Management System
          </p>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: '6px',
            backgroundColor: '#eff6ff', color: '#1e40af', padding: '4px 10px',
            borderRadius: '9999px', fontSize: '11px', fontWeight: '700', marginTop: '10px'
          }}>
            <ShieldCheck size={14} /> Process Handler Portal
          </div>
        </div>

        {error && (
          <div style={{
            padding: '12px 14px', backgroundColor: '#fef2f2', border: '1px solid #fecaca',
            borderRadius: '8px', color: '#991b1b', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px'
          }}>
            <AlertCircle size={16} style={{ flexShrink: 0 }} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group" style={{ marginBottom: '16px' }}>
            <label className="form-label">Username</label>
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                className="form-control"
                placeholder="Enter username"
                value={username}
                onChange={e => setUsername(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: '24px' }}>
            <label className="form-label">Password / Security PIN</label>
            <div style={{ position: 'relative' }}>
              <input
                type="password"
                className="form-control"
                placeholder="Enter password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
              />
            </div>
          </div>

          <button
            type="submit"
            className="btn-primary btn-large"
            disabled={loading}
            style={{ width: '100%', justifyContent: 'center' }}
          >
            {loading ? 'Authenticating...' : <>Sign In to Process Portal <ArrowRight size={16} /></>}
          </button>

          <div style={{
            marginTop: '20px', padding: '12px', backgroundColor: '#f8fafc',
            border: '1px solid #e2e8f0', borderRadius: '8px', textAlign: 'center', fontSize: '12px', color: '#64748b'
          }}>
            Default Credentials: <strong>handler</strong> / <strong>admin123</strong>
          </div>
        </form>
      </div>
    </div>
  );
}
