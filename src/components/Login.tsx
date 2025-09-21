// src/components/Login.tsx
import React, { useState } from 'react';
import { login } from '../api';
import { useAuth } from '../auth';

export default function Login() {
    const { setToken } = useAuth();
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    const onSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setErr(null); setBusy(true);
        try {
            const auth = await login(username.trim(), password);
            console.log('auth', auth);

            // Save what you need
            setToken(auth.accessToken);
            // optionally persist:
            // localStorage.setItem('access_token', auth.accessToken);
            // localStorage.setItem('refresh_token', auth.refreshToken);
            // localStorage.setItem('expires_at', String(auth.expiresAt));
        } catch (e: any) {
            // console.log('error', e);

            setErr(e?.message ?? 'Login failed');
        } finally {
            setBusy(false);
        }
    };


    // const onSubmit = async (e: React.FormEvent) => {
    //     e.preventDefault();
    //     setErr(null); setBusy(true);
    //     try {
    //         const res = await fetch('https://aicdb.carscan.ai/aicdb/auth/login', {
    //             method: "POST",
    //             headers: {
    //                 "Content-Type": "application/x-www-form-urlencoded",
    //                 Accept: "application/json",
    //                 // Do NOT send browser-only headers from curl (sec-*, user-agent, etc.)
    //             },
    //             body: new URLSearchParams({ username, password }).toString(),
    //             credentials: "include", // keep if server uses cookies for session
    //             mode: "cors",
    //         });
    //         const text = await res.text();
    //         let payload: any = text;
    //         try {
    //             payload = JSON.parse(text);
    //         } catch (_) {
    //             // non-JSON payload; keep raw text
    //         }
    //         if (!res.ok) {
    //             console.log(res);
    //             // setError({ status: res.status, statusText: res.statusText, payload });
    //         } else {
    //             console.log(res);

    //             // setToken(res.accessToken);
    //         }
    //     } catch (e: any) {
    //         console.log('eee', e);

    //         setErr(e?.message ?? 'Login failed');

    //     } finally {
    //         setBusy(false);
    //     }
    // };





    return (
        <div style={{
            position: 'fixed', inset: 0, display: 'grid', placeItems: 'center',
            background: '#0a0a0a', color: '#e5e5e5'
        }}>
            <form onSubmit={onSubmit} style={{
                width: 360, background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.12)', padding: 16, borderRadius: 12
            }}>
                <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 12 }}>Sign in</div>

                <label style={{ display: 'block', fontSize: 12, opacity: 0.8 }}>Username</label>
                <input
                    value={username}
                    onChange={e => setUsername(e.target.value)}
                    style={{ width: '100%', margin: '6px 0 12px', padding: 8, borderRadius: 8, border: '1px solid #444', background: '#1c1c1c', color: '#eee' }}
                    disabled={busy}
                />

                <label style={{ display: 'block', fontSize: 12, opacity: 0.8 }}>Password</label>
                <input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    style={{ width: '100%', margin: '6px 0 12px', padding: 8, borderRadius: 8, border: '1px solid #444', background: '#1c1c1c', color: '#eee' }}
                    disabled={busy}
                />

                {err && <div style={{ color: '#f87171', marginBottom: 8, fontSize: 12 }}>{err}</div>}

                <button disabled={busy || !username || !password}
                    style={{ width: '100%', padding: '10px 12px', borderRadius: 8, background: '#60a5fa', color: '#111', border: '1px solid #3b82f6', fontWeight: 700 }}>
                    {busy ? 'Signing in…' : 'Sign in'}
                </button>
            </form>
        </div>
    );
}
