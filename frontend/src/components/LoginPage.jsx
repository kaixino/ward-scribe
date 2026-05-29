import React, { useState } from 'react';
import { ClipboardList, LogIn, AlertTriangle, Eye, EyeOff } from 'lucide-react';
import './LoginPage.css';

const API_BASE = '/api';

export default function LoginPage({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [shift, setShift] = useState('Day');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!username || !password) {
      setError('Please enter your username and password');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await fetch(`${API_BASE}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Login failed');
        setLoading(false);
        return;
      }

      onLogin({ ...data, shift });
    } catch (err) {
      setError('Unable to connect. Is the server running?');
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">
          <div className="login-logo-icon">
            <ClipboardList size={36} />
          </div>
          <h1>WardScribe</h1>
          <p className="login-tagline">Nursing Documentation System</p>
        </div>

        {error && (
          <div className="login-error">
            <AlertTriangle size={16} />
            <span>{error}</span>
          </div>
        )}

        <form className="login-form" onSubmit={handleSubmit}>
          <div className="login-field">
            <label htmlFor="username">Username</label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="e.g. sarah.chen"
              autoFocus
              required
            />
          </div>

          <div className="login-field">
            <label htmlFor="password">Password</label>
            <div className="password-wrapper">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                required
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowPassword(!showPassword)}
                tabIndex={-1}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <div className="login-field">
            <label htmlFor="shift">Shift</label>
            <select
              id="shift"
              value={shift}
              onChange={(e) => setShift(e.target.value)}
            >
              <option value="Day">Day Shift</option>
              <option value="Night">Night Shift</option>
              <option value="Long">Long Day</option>
            </select>
          </div>

          <button className="btn-primary login-btn" type="submit" disabled={loading}>
            {loading ? (
              <>Signing in...</>
            ) : (
              <><LogIn size={18} /> Sign In</>
            )}
          </button>

          <div className="login-hint">
            <p>Demo credentials:</p>
            <div className="demo-creds">
              <div><code>sarah.chen</code> / <code>nurse123</code> <span className="cred-role">(RN, General Ward)</span></div>
              <div><code>james.r</code> / <code>nurse123</code> <span className="cred-role">(RN, Night, ICU)</span></div>
              <div><code>emily.w</code> / <code>nurse123</code> <span className="cred-role">(CN, General Ward)</span></div>
              <div><code>michael.o</code> / <code>doctor123</code> <span className="cred-role">(Medical Officer)</span></div>
              <div><code>sarah.l</code> / <code>doctor123</code> <span className="cred-role">(Consultant, ICU)</span></div>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
