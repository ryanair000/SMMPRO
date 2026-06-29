"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import toast, { Toaster } from 'react-hot-toast';
import styles from './login.module.css';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async (event) => {
    event.preventDefault();
    setErrorMessage('');
    setIsLoading(true);

    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      if (res.ok) {
        toast.success('Welcome to SMM Pro!');
        router.push('/');
        router.refresh();
      } else {
        const data = await res.json();
        const message = data.error || 'Login failed';
        setErrorMessage(message);
        toast.error(message);
      }
    } catch {
      setErrorMessage('Network error');
      toast.error('Network error');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={styles.loginShell}>
      <Toaster position="top-center" />
      <div className={`glass-panel ${styles.loginPanel}`}>
        <h1 className={styles.title}>SMM Pro</h1>
        <p className={styles.subtitle}>Secure Access Portal</p>

        <form onSubmit={handleLogin} className={styles.form}>
          {errorMessage && (
            <p className={styles.errorText} role="alert">
              {errorMessage}
            </p>
          )}

          <div className={styles.field}>
            <label htmlFor="email">Email Address</label>
            <input
              id="email"
              type="email"
              required
              className="input-field"
              placeholder="admin@example.com"
              value={email}
              onChange={event => setEmail(event.target.value)}
              autoComplete="username"
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="password">Password</label>
            <div className={styles.passwordRow}>
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                required
                className="input-field"
                placeholder="Password"
                value={password}
                onChange={event => setPassword(event.target.value)}
                autoComplete="current-password"
              />
              <button
                type="button"
                className={styles.toggleButton}
                onClick={() => setShowPassword(value => !value)}
                aria-pressed={showPassword}
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>

          <button
            type="submit"
            className={`btn ${styles.submitButton}`}
            disabled={isLoading}
          >
            {isLoading ? 'Authenticating...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}
