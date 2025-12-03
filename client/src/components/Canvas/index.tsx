import React, { useRef, useEffect } from 'react';
import { type Position } from '../../types/game';

interface WorldObject {
    id: number;
    x: number;
    y: number;
    type: string;
}

interface CanvasProps {
    players: Record<string, Position>;
    objects: WorldObject[];
    myId: string | null;
    messages: { fromId: string; text: string }[];
}

export const GameCanvas: React.FC<CanvasProps> = ({ players, objects, myId, messages }: CanvasProps) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Clear canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Draw grid
        ctx.strokeStyle = '#ddd';
        const gridSize = 20;
        for (let x = 0; x <= canvas.width; x += gridSize) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, canvas.height);
            ctx.stroke();
        }
        for (let y = 0; y <= canvas.height; y += gridSize) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(canvas.width, y);
            ctx.stroke();
        }

        // Draw Objects
        objects.forEach(obj => {
            ctx.fillStyle = obj.type === 'tree' ? '#22c55e' : '#64748b'; // Green for tree, Gray for rock
            ctx.fillRect(obj.x, obj.y, 30, 30);
        });

        // Draw players
        const HARDCODED_ADMIN_ID = "user_12345678789"; // CHANGE THIS to match server!

        Object.entries(players).forEach(([id, pos]) => {
            ctx.fillStyle = id === myId ? 'blue' : 'red';
            ctx.fillRect(
                pos.x + canvas.width / 2,
                pos.y + canvas.height / 2,
                20,
                20
            );

            // Draw label with owner badge
            const isOwner = id === HARDCODED_ADMIN_ID;
            const label = id.slice(0, 8) + (isOwner ? ' (Tuan)' : '');

            ctx.fillStyle = 'black';
            ctx.font = isOwner ? 'bold 10px Arial' : '10px Arial';
            ctx.fillText(label, pos.x + canvas.width / 2, pos.y + canvas.height / 2 - 5);

            // Draw Chat Bubble
            const lastMsg = messages.filter(m => m.fromId === id).slice(-1)[0];
            if (lastMsg) {
                ctx.fillStyle = 'white';
                ctx.strokeStyle = 'black';
                const textWidth = ctx.measureText(lastMsg.text).width;
                const bubbleX = pos.x + canvas.width / 2 - textWidth / 2;
                const bubbleY = pos.y + canvas.height / 2 - 30;

                ctx.fillRect(bubbleX - 5, bubbleY - 15, textWidth + 10, 20);
                ctx.strokeRect(bubbleX - 5, bubbleY - 15, textWidth + 10, 20);

                ctx.fillStyle = 'black';
                ctx.fillText(lastMsg.text, bubbleX, bubbleY);
            }
        });
    }, [players, objects, myId, messages]);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <canvas
                ref={canvasRef}
                width={600}
                height={400}
                style={{ border: '2px solid #cbd5e1', borderRadius: '8px', backgroundColor: 'white', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
            />
            <p style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: '#64748b' }}>
                Use arrow keys to move (Blue = You, Red = Others, Green = Tree, Gray = Rock)
            </p>
        </div>
    );
};
