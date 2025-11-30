import React, { useEffect, useState, useRef } from 'react';
import { GameCanvas } from '../Canvas';
import { type Position, type GameUpdate } from '../../types/game';
import { TonConnectButton, useTonWallet } from '@tonconnect/ui-react';

export const Game: React.FC = () => {
    const [players, setPlayers] = useState<Record<string, Position>>({});
    const [objects, setObjects] = useState<any[]>([]);
    const [myId, setMyId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const wsRef = useRef<WebSocket | null>(null);
    const wallet = useTonWallet();

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
                    setPlayers(msg.players);
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

    const handleMint = async () => {
        if (!wallet) {
            alert('Please connect your wallet first!');
            return;
        }
        alert('Minting feature coming soon to Go backend!');
    };

    const myPosition = (myId && players[myId]) ? players[myId] : { x: 0, y: 0 };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '1rem' }}>
            {error && (
                <div style={{ color: 'red', marginBottom: '1rem' }}>
                    {error}
                </div>
            )}
            <GameCanvas players={players} objects={objects} myId={myId} />
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
