import React, { useRef, useEffect } from 'react';
import { Position } from '../../types/game';

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
}

export const GameCanvas: React.FC<CanvasProps> = ({ players, objects, myId }: CanvasProps) => {
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
        Object.entries(players).forEach(([id, pos]) => {
            ctx.fillStyle = id === myId ? 'blue' : 'red';
            ctx.fillRect(
                pos.x + canvas.width / 2,
                pos.y + canvas.height / 2,
                20,
                20
            );

            // Draw label
            ctx.fillStyle = 'black';
            ctx.font = '10px Arial';
            ctx.fillText(id.slice(0, 4), pos.x + canvas.width / 2, pos.y + canvas.height / 2 - 5);
        });
    }, [players, objects, myId]);

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
