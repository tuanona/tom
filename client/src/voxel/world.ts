import { AIR } from './palette';

// Voxel grid. Layout: idx = x + z*w + y*w*d (same as the Go server).
export class VoxelWorld {
    readonly w: number;
    readonly h: number;
    readonly d: number;
    readonly data: Uint8Array;

    constructor(w: number, h: number, d: number, data?: Uint8Array) {
        this.w = w;
        this.h = h;
        this.d = d;
        this.data = data ?? new Uint8Array(w * h * d);
        if (this.data.length !== w * h * d) {
            throw new Error('VoxelWorld: grid size mismatch');
        }
    }

    inBounds(x: number, y: number, z: number): boolean {
        return x >= 0 && x < this.w && y >= 0 && y < this.h && z >= 0 && z < this.d;
    }

    get(x: number, y: number, z: number): number {
        if (!this.inBounds(x, y, z)) return AIR;
        return this.data[x + z * this.w + y * this.w * this.d];
    }

    set(x: number, y: number, z: number, b: number): boolean {
        if (!this.inBounds(x, y, z)) return false;
        const i = x + z * this.w + y * this.w * this.d;
        if (this.data[i] === b) return false;
        this.data[i] = b;
        return true;
    }

    isSolid(x: number, y: number, z: number): boolean {
        return this.get(x, y, z) !== AIR;
    }

    // Highest solid y at column (x,z), or -1 when the column is empty (void).
    topSolidY(x: number, z: number): number {
        if (x < 0 || x >= this.w || z < 0 || z >= this.d) return -1;
        for (let y = this.h - 1; y >= 0; y--) {
            if (this.data[x + z * this.w + y * this.w * this.d] !== AIR) return y;
        }
        return -1;
    }
}

export function decodeBase64Grid(b64: string): Uint8Array {
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return arr;
}
