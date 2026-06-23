"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      
      if (res.ok) {
        toast.success('Welcome to Chezahub AutoPoster!');
        router.push('/');
        router.refresh();
      } else {
        const data = await res.json();
        toast.error(data.error || 'Login failed');
      }
    } catch (err) {
      toast.error('Network error');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #1e3c72 0%, #2a5298 100%)',
      padding: '20px'
    }}>
      <div className="glass-panel" style={{ width: '100%', maxWidth: '400px', padding: '40px 30px' }}>
        <h1 style={{ textAlign: 'center', marginBottom: '10px', fontSize: '1.8rem', color: 'var(--text-primary)' }}>
          Chezahub AutoPoster
        </h1>
        <p style={{ textAlign: 'center', color: 'var(--text-secondary)', marginBottom: '30px' }}>
          Secure Access Portal
        </p>
        
        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', fontWeight: '500' }}>Email Address</label>
            <input 
              type="email" 
              required
              className="input-field" 
              placeholder="smm@lokimax.top"
              value={email}
              onChange={e => setEmail(e.target.value)}
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', fontWeight: '500' }}>Password</label>
            <input 
              type="password" 
              required
              className="input-field" 
              placeholder="••••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
            />
          </div>
          
          <button 
            type="submit" 
            className="btn" 
            disabled={isLoading}
            style={{ marginTop: '10px' }}
          >
            {isLoading ? 'Authenticating...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}
