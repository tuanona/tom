// Block palette — IDs must stay in sync with server/internal/world/world.go

export const AIR = 0;

export interface BlockDef {
    id: number;
    name: string;
    color: string; // sRGB hex
}

// Soft pastel set tuned to feel at home next to Telegram's glossy
// sticker/gift art (rounded, friendly, low-contrast).
export const BLOCKS: BlockDef[] = [
    { id: 1, name: 'Grass', color: '#7fd470' },
    { id: 2, name: 'Dirt', color: '#b08968' },
    { id: 3, name: 'Stone', color: '#b8bfc9' },
    { id: 4, name: 'Wood', color: '#9a6b4a' },
    { id: 5, name: 'Leaves', color: '#5cc97a' },
    { id: 6, name: 'White', color: '#ffffff' },
    { id: 7, name: 'Red', color: '#ff7e87' },
    { id: 8, name: 'Orange', color: '#ffb169' },
    { id: 9, name: 'Yellow', color: '#ffd95e' },
    { id: 10, name: 'Lime', color: '#a8e063' },
    { id: 11, name: 'Blue', color: '#6ab3f3' },
    { id: 12, name: 'Purple', color: '#b08ff7' },
    { id: 13, name: 'Pink', color: '#ff9ed1' },
    { id: 14, name: 'Cyan', color: '#7adfe8' },
    { id: 15, name: 'Charcoal', color: '#4b5563' },
];

export const BLOCK_BY_ID: ReadonlyMap<number, BlockDef> = new Map(
    BLOCKS.map(b => [b.id, b]),
);
