import { useState, useEffect } from 'react';

interface LoginProps {
  onLogin: () => void;
}

export function Login({ onLogin }: LoginProps) {
  const [error, setError] = useState('');
  const [qrUrl, setQrUrl] = useState('');
  const [polling, setPolling] = useState(false);

  // Check for existing session
  useEffect(() => {
    const token = localStorage.getItem('tom_session_token');
    if (token) {
      // In a real app, verify token validity with backend here
      onLogin();
    }
  }, []);

  // Initialize QR Login
  const initQR = async () => {
    try {
      const res = await fetch('http://localhost:8080/api/auth/qr/init', { method: 'POST' });
      const data = await res.json();
      setQrUrl(data.url);
      startPolling(data.id);
    } catch (err) {
      setError('Failed to generate QR code');
    }
  };

  // Poll for QR scan
  const startPolling = (id: string) => {
    setPolling(true);
    const pollInterval = setInterval(async () => {
      try {
        const res = await fetch(`http://localhost:8080/api/auth/qr/poll?id=${id}`);
        const data = await res.json();

        if (data.status === 'authenticated') {
          clearInterval(pollInterval);
          setPolling(false);
          localStorage.setItem('tom_session_token', 'valid'); // Store dummy token for now
          onLogin();
        }
      } catch (err) {
        console.error('Polling error:', err);
      }
    }, 2000);

    // Auto-stop after 5 minutes
    setTimeout(() => {
      clearInterval(pollInterval);
      setPolling(false);
      setError('QR code expired. Please try again.');
    }, 300000);
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      fontFamily: 'Inter, system-ui, sans-serif'
    }}>
      <div style={{
        background: 'white',
        borderRadius: '1rem',
        padding: '2rem',
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        maxWidth: '400px',
        width: '90%'
      }}>
        <h1 style={{ margin: '0 0 0.5rem 0', fontSize: '2rem', fontWeight: 700, color: '#1e293b' }}>
          Tom Passport
        </h1>
        <p style={{ margin: '0 0 2rem 0', color: '#64748b' }}>
          Scan QR with Telegram Mini App
        </p>

        {error && (
          <div style={{
            padding: '0.75rem',
            background: '#fee2e2',
            color: '#b91c1c',
            borderRadius: '0.5rem',
            marginBottom: '1rem',
            fontSize: '0.875rem'
          }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {!qrUrl ? (
            <button
              onClick={initQR}
              style={{
                padding: '0.75rem 1.5rem',
                background: '#2563eb',
                color: 'white',
                border: 'none',
                borderRadius: '0.5rem',
                fontSize: '1rem',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = '#1d4ed8'}
              onMouseLeave={(e) => e.currentTarget.style.background = '#2563eb'}
            >
              Generate QR Code
            </button>
          ) : (
            <div style={{ textAlign: 'center' }}>
              <div style={{
                padding: '1.5rem',
                background: '#f1f5f9',
                borderRadius: '0.75rem',
                marginBottom: '1rem'
              }}>
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrUrl)}`}
                  alt="QR Code"
                  style={{ width: '200px', height: '200px' }}
                />
              </div>
              {polling && (
                <p style={{ color: '#64748b', fontSize: '0.875rem', margin: 0 }}>
                  Waiting for scan...
                </p>
              )}
            </div>
          )}
        </div>

        <div style={{
          marginTop: '2rem',
          paddingTop: '1.5rem',
          borderTop: '1px solid #e2e8f0',
          fontSize: '0.875rem',
          color: '#64748b',
          textAlign: 'center'
        }}>
          <p style={{ margin: 0 }}>
            Don't have the TMA?
          </p>
          <a
            href="https://t.me/TomGameBot"
            style={{ color: '#2563eb', textDecoration: 'none', fontWeight: 600 }}
            target="_blank"
            rel="noopener noreferrer"
          >
            Open Telegram Bot →
          </a>
        </div>
      </div>
    </div>
  );
}
