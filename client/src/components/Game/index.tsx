import React, { useEffect, useRef, useState } from 'react';
import { TonConnectButton, useTonWallet } from '@tonconnect/ui-react';
import { VoxelEngine } from '../../voxel/engine';
import { decodeBase64Grid } from '../../voxel/world';
import { BLOCKS } from '../../voxel/palette';
import { wsGameUrl } from '../../lib/api';
import { useLang } from '../../lib/i18n';
import type { AuthSession, ClientMsg, ServerMsg } from '../../lib/protocol';
import type { TKey } from '../../lib/i18n';

interface GameProps {
    session: AuthSession;
    onLogout: () => void;
}

interface ChatLine {
    fromId: string;
    name: string;
    text: string;
}

type ConnState = 'connecting' | 'open' | 'closed';

export const Game: React.FC<GameProps> = ({ session, onLogout }) => {
    const { t } = useLang();
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const engineRef = useRef<VoxelEngine | null>(null);
    const wsRef = useRef<WebSocket | null>(null);
    const joyBaseRef = useRef<HTMLDivElement>(null);
    const joyKnobRef = useRef<HTMLDivElement>(null);

    const [conn, setConn] = useState<ConnState>('connecting');
    const [myName, setMyName] = useState(session.name);
    const [messages, setMessages] = useState<ChatLine[]>([]);
    const [chatInput, setChatInput] = useState('');
    const [buildMode, setBuildMode] = useState(false);
    const [removeMode, setRemoveMode] = useState(false);
    const [selectedBlock, setSelectedBlock] = useState(11);
    const wallet = useTonWallet();

    const send = (msg: ClientMsg) => {
        const ws = wsRef.current;
        if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
    };

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const engine = new VoxelEngine(canvas, {
            onMove: (x, y, z, ry) => send({ type: 'Move', x, y, z, ry }),
            onEdit: (x, y, z, block, action) => {
                if (action === 'place') send({ type: 'PlaceBlock', x, y, z, block });
                else send({ type: 'RemoveBlock', x, y, z });
            },
            onJoystick: (st) => {
                const base = joyBaseRef.current;
                const knob = joyKnobRef.current;
                if (!base || !knob) return;
                base.style.display = st.active ? 'block' : 'none';
                knob.style.display = st.active ? 'block' : 'none';
                if (st.active) {
                    base.style.left = `${st.baseX - 56}px`;
                    base.style.top = `${st.baseY - 56}px`;
                    knob.style.left = `${st.baseX + st.dx - 28}px`;
                    knob.style.top = `${st.baseY + st.dy - 28}px`;
                }
            },
        });
        engineRef.current = engine;

        let disposed = false;
        let retryTimer: ReturnType<typeof setTimeout> | null = null;

        const connect = () => {
            if (disposed) return;
            setConn('connecting');
            const ws = new WebSocket(wsGameUrl(session.token));
            wsRef.current = ws;

            ws.onopen = () => setConn('open');

            ws.onmessage = (event) => {
                let msg: ServerMsg;
                try {
                    msg = JSON.parse(event.data);
                } catch {
                    return;
                }
                switch (msg.type) {
                    case 'Welcome':
                        setMyName(msg.name);
                        engine.setMyIdentity(msg.id, msg.name, msg.spawnX, msg.spawnZ);
                        break;
                    case 'WorldInit':
                        engine.setWorld(msg.w, msg.h, msg.d, decodeBase64Grid(msg.data));
                        break;
                    case 'Snapshot':
                        engine.updatePlayers(msg.players ?? {});
                        break;
                    case 'Chat':
                        setMessages(prev => [...prev.slice(-5), { fromId: msg.fromId, name: msg.name, text: msg.message }]);
                        engine.showBubble(msg.fromId, msg.message);
                        break;
                    case 'BlockPlaced':
                        engine.applyBlock(msg.x, msg.y, msg.z, msg.block);
                        break;
                    case 'BlockRemoved':
                        engine.applyBlock(msg.x, msg.y, msg.z, 0);
                        break;
                }
            };

            ws.onclose = () => {
                if (disposed) return;
                setConn('closed');
                retryTimer = setTimeout(connect, 2500);
            };
        };
        connect();

        return () => {
            disposed = true;
            if (retryTimer) clearTimeout(retryTimer);
            wsRef.current?.close();
            engine.dispose();
            engineRef.current = null;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [session.token]);

    // Engine flags follow HUD state.
    useEffect(() => { engineRef.current?.setBuildMode(buildMode); }, [buildMode]);
    useEffect(() => { if (engineRef.current) engineRef.current.removeMode = removeMode; }, [removeMode]);
    useEffect(() => { if (engineRef.current) engineRef.current.selectedBlock = selectedBlock; }, [selectedBlock]);

    const handleSendChat = (e: React.FormEvent) => {
        e.preventDefault();
        const text = chatInput.trim();
        if (!text) return;
        send({ type: 'Chat', message: text });
        setChatInput('');
        (document.activeElement as HTMLElement | null)?.blur();
    };

    const handleLogout = () => {
        localStorage.removeItem('tom_session_token');
        onLogout();
    };

    const overlay: React.CSSProperties = { position: 'absolute', pointerEvents: 'auto' };

    return (
        <div style={{ position: 'fixed', inset: 0, overflow: 'hidden', background: '#a5d8ff' }}>
            <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block', touchAction: 'none' }} />

            {/* Joystick visuals (driven imperatively by the engine) */}
            <div ref={joyBaseRef} style={{
                display: 'none', position: 'absolute', width: 112, height: 112, borderRadius: '50%',
                background: 'rgba(255,255,255,0.12)', border: '2px solid rgba(255,255,255,0.35)', pointerEvents: 'none',
            }} />
            <div ref={joyKnobRef} style={{
                display: 'none', position: 'absolute', width: 56, height: 56, borderRadius: '50%',
                background: 'rgba(255,255,255,0.45)', pointerEvents: 'none',
            }} />

            {/* Top-left: identity + connection */}
            <div style={{ ...overlay, top: 10, left: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{
                    background: 'rgba(15,23,42,0.6)', color: 'white', padding: '6px 12px',
                    borderRadius: 999, fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8,
                }}>
                    <span style={{
                        width: 8, height: 8, borderRadius: '50%',
                        background: conn === 'open' ? '#4ade80' : conn === 'connecting' ? '#facc15' : '#ef4444',
                    }} />
                    {myName || session.userId}
                </div>
                {conn === 'closed' && (
                    <div style={{ background: 'rgba(239,68,68,0.9)', color: 'white', padding: '6px 10px', borderRadius: 8, fontSize: 12 }}>
                        {t('disconnected')}
                    </div>
                )}
            </div>

            {/* Top-right: wallet + logout */}
            <div style={{ ...overlay, top: 10, right: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                <TonConnectButton />
                {wallet && (
                    <div style={{ background: 'rgba(15,23,42,0.6)', color: '#8ec5e8', padding: '6px 10px', borderRadius: 8, fontSize: 12 }}>
                        TON ✓
                    </div>
                )}
                <button onClick={handleLogout} style={{
                    padding: '8px 12px', backgroundColor: 'rgba(239,68,68,0.9)', color: 'white',
                    border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 13,
                }}>
                    {t('logout')}
                </button>
            </div>

            {/* Bottom-right: build controls */}
            <div style={{ ...overlay, right: 10, bottom: 10, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
                {buildMode && (
                    <div style={{
                        display: 'flex', gap: 6, padding: 8, background: 'rgba(15,23,42,0.6)',
                        borderRadius: 12, maxWidth: 'min(92vw, 420px)', overflowX: 'auto',
                    }}>
                        {BLOCKS.map(b => (
                            <button
                                key={b.id}
                                title={t(`block_${b.id}` as TKey)}
                                onClick={() => { setSelectedBlock(b.id); setRemoveMode(false); }}
                                style={{
                                    width: 30, height: 30, minWidth: 30, borderRadius: 8, cursor: 'pointer',
                                    background: b.color,
                                    border: selectedBlock === b.id && !removeMode
                                        ? '3px solid white' : '2px solid rgba(255,255,255,0.25)',
                                }}
                            />
                        ))}
                        <button
                            title={t('removeTool')}
                            onClick={() => setRemoveMode(r => !r)}
                            style={{
                                width: 30, height: 30, minWidth: 30, borderRadius: 8, cursor: 'pointer',
                                background: 'rgba(255,255,255,0.12)', color: 'white', fontSize: 15, lineHeight: 1,
                                border: removeMode ? '3px solid #ef4444' : '2px solid rgba(255,255,255,0.25)',
                            }}
                        >⛏</button>
                    </div>
                )}
                <button
                    onClick={() => setBuildMode(b => !b)}
                    style={{
                        width: 56, height: 56, borderRadius: '50%', border: 'none', cursor: 'pointer',
                        fontSize: 26, background: buildMode ? '#f3d34a' : 'rgba(15,23,42,0.6)',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
                    }}
                >
                    {buildMode ? '🧱' : '🔨'}
                </button>
            </div>

            {/* Bottom-left: chat */}
            <div style={{ ...overlay, left: 10, bottom: 10, display: 'flex', flexDirection: 'column', gap: 6, maxWidth: 'min(70vw, 320px)' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3, maxHeight: 120, overflowY: 'auto' }}>
                    {messages.map((m, i) => (
                        <div key={i} style={{
                            backgroundColor: 'rgba(15,23,42,0.55)', color: 'white', padding: '3px 8px',
                            borderRadius: 6, fontSize: 12, wordBreak: 'break-word',
                        }}>
                            <b>{m.name || m.fromId.slice(0, 6)}:</b> {m.text}
                        </div>
                    ))}
                </div>
                <form onSubmit={handleSendChat}>
                    <input
                        type="text"
                        value={chatInput}
                        onChange={e => setChatInput(e.target.value)}
                        placeholder={t('chatPlaceholder')}
                        maxLength={200}
                        style={{
                            width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 8,
                            border: 'none', backgroundColor: 'rgba(255,255,255,0.85)', fontSize: 13, outline: 'none',
                        }}
                    />
                </form>
            </div>

            {/* Hint */}
            <div style={{
                ...overlay, bottom: 86, left: '50%', transform: 'translateX(-50%)',
                color: 'rgba(255,255,255,0.85)', fontSize: 11, textAlign: 'center',
                background: 'rgba(15,23,42,0.35)', padding: '4px 10px', borderRadius: 999,
                pointerEvents: 'none', whiteSpace: 'nowrap',
            }}>
                {buildMode
                    ? (removeMode ? t('hintRemove') : t('hintBuild'))
                    : t('hintWalk')}
            </div>
        </div>
    );
};
