import React, { useState } from 'react';

interface LoginProps {
  onLogin: () => void;
}

export const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('http://localhost:8080/api/auth/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      
      if (res.ok) {
        onLogin();
      } else {
        setError('Invalid invite code');
      }
    } catch {
      setError('Failed to connect to server');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '2rem', backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '1rem' }}>Welcome to TOM</h1>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', width: '100%' }}>
        <input
          type="text"
          placeholder="Enter Invite Code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid #cbd5e1' }}
        />
        {error && <p style={{ color: 'red', fontSize: '0.875rem' }}>{error}</p>}
        <button
          type="submit"
          style={{ backgroundColor: '#2563eb', color: 'white', padding: '0.5rem', borderRadius: '4px', border: 'none', cursor: 'pointer' }}
        >
          Enter World
        </button>
      </form>
    </div>
  );
};
