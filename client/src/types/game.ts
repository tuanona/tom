export interface Position {
    x: number;
    y: number;
}

export type GameMessage =
    | { type: 'Move'; x: number; y: number };

export type GameUpdate =
    | { type: 'Welcome'; id: string }
    | { type: 'WorldUpdate'; players: Record<string, Position> };
