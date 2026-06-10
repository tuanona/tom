import React, { useEffect, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { API_BASE } from '../../lib/api';
import { useLang } from '../../lib/i18n';
import type { AuthSession } from '../../lib/protocol';

interface LoginProps {
    onLogin: (session: AuthSession) => void;
}

const BOT_URL = 'https://t.me/tom_survivor_bot';

function telegramInitData(): string {
    return (window as any).Telegram?.WebApp?.initData ?? '';
}

export function Login({ onLogin }: LoginProps) {
    const { lang, setLang, t } = useLang();
    const [error, setError] = useState('');
    const [qrPayload, setQrPayload] = useState('');
    const [polling, setPolling] = useState(false);
    const [busy, setBusy] = useState<'checking' | 'tma' | null>('checking');
    const [inviteName, setInviteName] = useState('');
    const [inviteCode, setInviteCode] = useState('');
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // Session restore → else in-Telegram auto-login → else interactive UI.
    useEffect(() => {
        let cancelled = false;

        const finish = (s: AuthSession) => {
            if (cancelled) return;
            localStorage.setItem('tom_session_token', s.token);
            onLogin(s);
        };

        const tryTelegram = async () => {
            const initData = telegramInitData();
            if (!initData) {
                if (!cancelled) setBusy(null);
                return;
            }
            const tg = (window as any).Telegram.WebApp;
            tg.ready?.();
            tg.expand?.();
            setBusy('tma');
            try {
                const res = await fetch(`${API_BASE}/api/auth/tma`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ initData }),
                });
                if (!res.ok) throw new Error('tma rejected');
                const data = await res.json();
                finish({ token: data.token, userId: data.userId, name: data.name ?? '' });
            } catch {
                if (!cancelled) {
                    setError(t('tmaFailed'));
                    setBusy(null);
                }
            }
        };

        const token = localStorage.getItem('tom_session_token');
        if (!token) {
            void tryTelegram();
            return () => { cancelled = true; };
        }
        fetch(`${API_BASE}/api/auth/me?token=${encodeURIComponent(token)}`)
            .then(res => (res.ok ? res.json() : Promise.reject(new Error('expired'))))
            .then((data: { userId: string; name: string }) =>
                finish({ token, userId: data.userId, name: data.name }))
            .catch(() => {
                localStorage.removeItem('tom_session_token');
                void tryTelegram();
            });
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => () => {
        if (pollRef.current) clearInterval(pollRef.current);
    }, []);

    const initQR = async () => {
        setError('');
        try {
            const res = await fetch(`${API_BASE}/api/auth/qr/init`, { method: 'POST' });
            const data = await res.json();
            setQrPayload(data.qr);
            startPolling(data.id);
        } catch {
            setError(`${t('qrFailed')} ${API_BASE}?`);
        }
    };

    const startPolling = (id: string) => {
        setPolling(true);
        const startedAt = Date.now();
        pollRef.current = setInterval(async () => {
            if (Date.now() - startedAt > 300000) {
                if (pollRef.current) clearInterval(pollRef.current);
                setPolling(false);
                setQrPayload('');
                setError(t('qrExpired'));
                return;
            }
            try {
                const res = await fetch(`${API_BASE}/api/auth/qr/poll?id=${id}`);
                const data = await res.json();
                if (data.status === 'authenticated' && data.token) {
                    if (pollRef.current) clearInterval(pollRef.current);
                    setPolling(false);
                    localStorage.setItem('tom_session_token', data.token);
                    onLogin({ token: data.token, userId: data.userId, name: data.name ?? '' });
                }
            } catch {
                // transient poll errors: keep trying until timeout
            }
        }, 2000);
    };

    const inviteLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        try {
            const res = await fetch(`${API_BASE}/api/auth/invite-login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: inviteName, code: inviteCode }),
            });
            if (!res.ok) {
                setError(t('inviteFailed'));
                return;
            }
            const data = await res.json();
            localStorage.setItem('tom_session_token', data.token);
            onLogin({ token: data.token, userId: data.userId, name: data.name });
        } catch {
            setError(t('inviteFailed'));
        }
    };

    const guestLogin = () => {
        // The server accepts this only in dev mode (BOT_TOKEN unset).
        onLogin({ token: 'dev', userId: 'guest', name: 'Guest' });
    };

    if (busy) {
        return (
            <div style={wrapStyle}>
                <div style={{ color: 'white', fontWeight: 600 }}>
                    {busy === 'tma' ? t('tmaLoggingIn') : t('checkingSession')}
                </div>
            </div>
        );
    }

    return (
        <div style={wrapStyle}>
            <div style={{
                background: 'white', borderRadius: '1rem', padding: '2rem',
                boxShadow: '0 20px 60px rgba(0,0,0,0.3)', maxWidth: 400, width: '90%',
                maxHeight: '90vh', overflowY: 'auto', position: 'relative',
            }}>
                <button
                    onClick={() => setLang(lang === 'en' ? 'id' : 'en')}
                    style={{
                        position: 'absolute', top: 14, right: 14, padding: '4px 10px',
                        background: '#f1f5f9', color: '#475569', border: 'none',
                        borderRadius: 999, cursor: 'pointer', fontSize: 12, fontWeight: 600,
                    }}
                >
                    {t('language')}
                </button>

                <h1 style={{ margin: '0 0 0.5rem 0', fontSize: '2rem', fontWeight: 700, color: '#1e293b' }}>
                    {t('appTitle')}
                </h1>
                <p style={{ margin: '0 0 1.5rem 0', color: '#64748b', whiteSpace: 'pre-line' }}>
                    {t('tagline')}
                </p>

                {error && (
                    <div style={{
                        padding: '0.75rem', background: '#fee2e2', color: '#b91c1c',
                        borderRadius: '0.5rem', marginBottom: '1rem', fontSize: '0.875rem',
                    }}>
                        {error}
                    </div>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {!qrPayload ? (
                        <button onClick={initQR} style={primaryBtn}>
                            {t('generateQR')}
                        </button>
                    ) : (
                        <div style={{ textAlign: 'center' }}>
                            <div style={{
                                padding: '1.5rem', background: '#f1f5f9',
                                borderRadius: '0.75rem', marginBottom: '1rem', display: 'inline-block',
                            }}>
                                <QRCodeSVG value={qrPayload} size={200} />
                            </div>
                            {polling && (
                                <p style={{ color: '#64748b', fontSize: '0.875rem', margin: 0 }}>
                                    {t('waitingScan')}
                                </p>
                            )}
                        </div>
                    )}

                    <div style={{ color: '#94a3b8', fontSize: '0.8rem', textAlign: 'center' }}>
                        — {t('orInvite')} —
                    </div>

                    <form onSubmit={inviteLogin} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        <input
                            value={inviteName}
                            onChange={e => setInviteName(e.target.value)}
                            placeholder={t('yourName')}
                            maxLength={24}
                            required
                            style={inputStyle}
                        />
                        <input
                            value={inviteCode}
                            onChange={e => setInviteCode(e.target.value)}
                            placeholder={t('inviteCode')}
                            required
                            style={inputStyle}
                        />
                        <button type="submit" style={{ ...primaryBtn, background: '#0ea5e9' }}>
                            {t('joinWorld')}
                        </button>
                    </form>

                    <button onClick={guestLogin} style={{
                        padding: '0.5rem', background: 'none', color: '#64748b',
                        border: '1px dashed #cbd5e1', borderRadius: '0.5rem', cursor: 'pointer', fontSize: '0.8rem',
                    }}>
                        {t('loginGuest')}
                    </button>
                </div>

                <div style={{
                    marginTop: '1.5rem', paddingTop: '1.25rem', borderTop: '1px solid #e2e8f0',
                    fontSize: '0.875rem', color: '#64748b', textAlign: 'center',
                }}>
                    <p style={{ margin: 0 }}>{t('noPassport')}</p>
                    <a
                        href={BOT_URL}
                        style={{ color: '#2563eb', textDecoration: 'none', fontWeight: 600 }}
                        target="_blank"
                        rel="noopener noreferrer"
                    >
                        {t('openBot')}
                    </a>
                </div>
            </div>
        </div>
    );
}

const wrapStyle: React.CSSProperties = {
    position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'linear-gradient(135deg, #5eb5f7 0%, #8a7df0 100%)',
    fontFamily: 'Inter, system-ui, sans-serif',
};

const primaryBtn: React.CSSProperties = {
    padding: '0.75rem 1.5rem', background: '#2563eb', color: 'white', border: 'none',
    borderRadius: '0.5rem', fontSize: '1rem', fontWeight: 600, cursor: 'pointer',
};

const inputStyle: React.CSSProperties = {
    padding: '0.6rem 0.75rem', borderRadius: '0.5rem', border: '1px solid #cbd5e1',
    fontSize: '0.9rem', outline: 'none', color: '#1e293b', background: 'white',
};
