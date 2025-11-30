export interface Position {
    x: number;
    y: number;
}

export type GameMessage =
    | { type: 'Move'; x: number; y: number }
    | { type: 'Chat'; message: string };

export type GameUpdate =
    | { type: 'Welcome'; id: string }
    | { type: 'WorldUpdate'; players: Record<string, Position> }
    | { type: 'Chat'; fromId: string; message: string };
