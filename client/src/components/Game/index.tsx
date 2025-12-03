import React, { useEffect, useState, useRef } from 'react';
import { GameCanvas } from '../Canvas';
import { type Position, type GameUpdate } from '../../types/game';
import { TonConnectButton, useTonWallet } from '@tonconnect/ui-react';

interface GameProps {
    onLogout: () => void;
}

export const Game: React.FC<GameProps> = ({ onLogout }) => {
    const [players, setPlayers] = useState<Record<string, Position>>({});
    const [objects, setObjects] = useState<any[]>([]);
    const [myId, setMyId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [messages, setMessages] = useState<{ fromId: string; text: string }[]>([]);
    const [chatInput, setChatInput] = useState('');
    const wsRef = useRef<WebSocket | null>(null);
    const wallet = useTonWallet();

    const handleLogout = () => {
        localStorage.removeItem('tom_session_token');
        onLogout();
    };

    // Fetch Objects
    useEffect(() => {
        fetch('http://localhost:8080/api/world/objects')
            .then(res => res.json())
            .then(data => setObjects(data))
            .catch(err => console.error('Failed to fetch objects', err));
    }, []);

    // WebSocket Connection
    useEffect(() => {
        const ws = new WebSocket('ws://localhost:8080/api/ws/game');
        wsRef.current = ws;

        ws.onopen = () => {
            console.log('Connected to Game WebSocket');
            setError(null);
        };

        ws.onmessage = (event) => {
            try {
                const msg: GameUpdate = JSON.parse(event.data);
                if (msg.type === 'Welcome') {
                    setMyId(msg.id);
                } else if (msg.type === 'WorldUpdate') {
                    setPlayers(msg.players || {});
                } else if (msg.type === 'Chat') {
                    setMessages(prev => [...prev.slice(-4), { fromId: msg.fromId, text: msg.message }]);
                }
            } catch (e) {
                console.error('Failed to parse game message', e);
            }
        };

        ws.onerror = () => {
            setError('WebSocket connection error');
        };

        ws.onclose = () => {
            console.log('Disconnected from Game WebSocket');
        };

        return () => {
            ws.close();
        };
    }, []);

    useEffect(() => {
        const handleKeyPress = (event: KeyboardEvent) => {
            // Don't move if typing in chat
            if (document.activeElement?.tagName === 'INPUT') return;

            if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN || !myId) return;

            const currentPos = players[myId] || { x: 0, y: 0 };
            const moveSpeed = 5;
            let newX = currentPos.x;
            let newY = currentPos.y;

            switch (event.key) {
                case 'ArrowUp':
                    newY -= moveSpeed;
                    break;
                case 'ArrowDown':
                    newY += moveSpeed;
                    break;
                case 'ArrowLeft':
                    newX -= moveSpeed;
                    break;
                case 'ArrowRight':
                    newX += moveSpeed;
                    break;
                default:
                    return;
            }

            // Send move command
            wsRef.current.send(JSON.stringify({
                type: 'Move',
                x: newX,
                y: newY
            }));
        };

        globalThis.addEventListener('keydown', handleKeyPress);
        return () => globalThis.removeEventListener('keydown', handleKeyPress);
    }, [players, myId]);

    const handleSendChat = (e: React.FormEvent) => {
        e.preventDefault();
        if (!chatInput.trim() || !wsRef.current) return;

        wsRef.current.send(JSON.stringify({
            type: 'Chat',
            message: chatInput
        }));
        setChatInput('');
    };

    const handleMint = async () => {
        if (!wallet) {
            alert('Please connect your wallet first!');
            return;
        }
        alert('Minting feature coming soon to Go backend!');
    };

    const myPosition = (myId && players && players[myId]) ? players[myId] : { x: 0, y: 0 };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '1rem', position: 'relative' }}>
            {/* Header with Logout */}
            <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h1 style={{ margin: 0, fontSize: '1.5rem', color: '#1e293b' }}>Tom Metaverse</h1>
                <button
                    onClick={handleLogout}
                    style={{
                        padding: '8px 16px',
                        backgroundColor: '#ef4444',
                        color: 'white',
                        border: 'none',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        fontWeight: 'bold'
                    }}
                >
                    Logout
                </button>
            </div>

            {error && (
                <div style={{ color: 'red', marginBottom: '1rem' }}>
                    {error}
                </div>
            )}

            <div style={{ position: 'relative' }}>
                <GameCanvas players={players} objects={objects} myId={myId} messages={messages} />

                {/* Chat Overlay */}
                <div style={{ position: 'absolute', bottom: '10px', left: '10px', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <div style={{ maxHeight: '100px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                        {messages.map((m, i) => (
                            <div key={i} style={{ backgroundColor: 'rgba(0,0,0,0.5)', color: 'white', padding: '0.25rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem' }}>
                                <b>{m.fromId.slice(0, 4)}:</b> {m.text}
                            </div>
                        ))}
                    </div>
                    <form onSubmit={handleSendChat} style={{ display: 'flex', gap: '0.5rem' }}>
                        <input
                            type="text"
                            value={chatInput}
                            onChange={e => setChatInput(e.target.value)}
                            placeholder="Type a message..."
                            style={{ padding: '0.25rem', borderRadius: '4px', border: 'none', backgroundColor: 'rgba(255,255,255,0.8)' }}
                        />
                    </form>
                </div>
            </div>

            <div style={{ marginTop: '1rem', display: 'flex', gap: '1rem', alignItems: 'center' }}>
                <div>
                    Position: ({Math.round(myPosition.x)}, {Math.round(myPosition.y)})
                </div>

                <TonConnectButton />

                {wallet && (
                    <button
                        onClick={handleMint}
                        style={{ backgroundColor: '#2563eb', color: 'white', padding: '0.5rem 1rem', borderRadius: '0.25rem', border: 'none', cursor: 'pointer' }}
                    >
                        Mint to TON
                    </button>
                )}
            </div>
            <p style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.5rem' }}>Real-time WebSocket Connection (Go Backend)</p>
        </div>
    );
};
