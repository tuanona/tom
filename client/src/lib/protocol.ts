// Wire protocol — must stay in sync with server/internal/game/game.go

export interface PlayerState {
    x: number;
    y: number;
    z: number;
    ry: number;
    name: string;
}

export type ServerMsg =
    | { type: 'Welcome'; id: string; name: string; spawnX: number; spawnZ: number }
    | { type: 'WorldInit'; w: number; h: number; d: number; data: string } // data = base64 voxel grid
    | { type: 'Snapshot'; players: Record<string, PlayerState> }
    | { type: 'Chat'; fromId: string; name: string; message: string }
    | { type: 'BlockPlaced'; x: number; y: number; z: number; block: number }
    | { type: 'BlockRemoved'; x: number; y: number; z: number; block: number };

export type ClientMsg =
    | { type: 'Move'; x: number; y: number; z: number; ry: number }
    | { type: 'Chat'; message: string }
    | { type: 'PlaceBlock'; x: number; y: number; z: number; block: number }
    | { type: 'RemoveBlock'; x: number; y: number; z: number };

export interface AuthSession {
    token: string;
    userId: string;
    name: string;
}
