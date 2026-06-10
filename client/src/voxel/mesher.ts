import * as THREE from 'three';
import { VoxelWorld } from './world';
import { BLOCKS } from './palette';

// Chunked greedy-lite mesher: emits only faces adjacent to air, with
// sun shading + ambient occlusion baked into vertex colors. Rendered with
// MeshBasicMaterial, so the whole island costs zero realtime lighting.

export const CHUNK = 16;

interface FaceDef {
    dir: [number, number, number];
    corners: [number, number, number][]; // triangle-strip order: a,b,c,d
    shade: number;
}

const FACES: FaceDef[] = [
    { dir: [-1, 0, 0], shade: 0.72, corners: [[0, 1, 0], [0, 0, 0], [0, 1, 1], [0, 0, 1]] },
    { dir: [1, 0, 0], shade: 0.72, corners: [[1, 1, 1], [1, 0, 1], [1, 1, 0], [1, 0, 0]] },
    { dir: [0, -1, 0], shade: 0.50, corners: [[1, 0, 1], [0, 0, 1], [1, 0, 0], [0, 0, 0]] },
    { dir: [0, 1, 0], shade: 1.00, corners: [[0, 1, 1], [1, 1, 1], [0, 1, 0], [1, 1, 0]] },
    { dir: [0, 0, -1], shade: 0.80, corners: [[1, 0, 0], [0, 0, 0], [1, 1, 0], [0, 1, 0]] },
    { dir: [0, 0, 1], shade: 0.80, corners: [[0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]] },
];

// Softer AO than classic Minecraft: pastel "toy island" look.
const AO_LUT = [0.62, 0.75, 0.88, 1.0];

// Linear-space palette colors indexed by block id.
const LINEAR_COLORS: [number, number, number][] = (() => {
    const arr: [number, number, number][] = [];
    arr[0] = [0, 0, 0];
    for (const b of BLOCKS) {
        const c = new THREE.Color(b.color); // converts sRGB → working (linear)
        arr[b.id] = [c.r, c.g, c.b];
    }
    return arr;
})();

// Small deterministic per-voxel brightness jitter so large single-color
// areas don't read as flat plastic.
function jitter(x: number, y: number, z: number): number {
    let h = (x * 374761393 + y * 668265263 + z * 974711) | 0;
    h = ((h ^ (h >> 13)) * 1274126177) | 0;
    h ^= h >> 16;
    return 0.97 + ((h & 0xff) / 255) * 0.05;
}

// Vertex AO: occlusion from the two edge neighbors + the corner neighbor
// on the face plane. side1 && side2 fully darkens the corner.
function vertexAO(
    world: VoxelWorld,
    px: number, py: number, pz: number,
    dir: [number, number, number],
    corner: [number, number, number],
): number {
    const axis = dir[0] !== 0 ? 0 : dir[1] !== 0 ? 1 : 2;
    const u = axis === 0 ? 1 : 0;
    const v = axis === 2 ? 1 : 2;

    const base = [px + dir[0], py + dir[1], pz + dir[2]];
    const su = corner[u] === 1 ? 1 : -1;
    const sv = corner[v] === 1 ? 1 : -1;

    const o1 = [...base];
    o1[u] += su;
    const o2 = [...base];
    o2[v] += sv;
    const oc = [...base];
    oc[u] += su;
    oc[v] += sv;

    const s1 = world.isSolid(o1[0], o1[1], o1[2]) ? 1 : 0;
    const s2 = world.isSolid(o2[0], o2[1], o2[2]) ? 1 : 0;
    const sc = world.isSolid(oc[0], oc[1], oc[2]) ? 1 : 0;

    const occ = s1 && s2 ? 3 : s1 + s2 + sc;
    return AO_LUT[3 - occ];
}

// Builds the geometry for the chunk whose origin is (cx*CHUNK, cz*CHUNK).
// Returns null when the chunk contains no visible faces.
export function buildChunkGeometry(world: VoxelWorld, cx: number, cz: number): THREE.BufferGeometry | null {
    const positions: number[] = [];
    const colors: number[] = [];
    const indices: number[] = [];

    const x0 = cx * CHUNK;
    const z0 = cz * CHUNK;
    const x1 = Math.min(x0 + CHUNK, world.w);
    const z1 = Math.min(z0 + CHUNK, world.d);

    for (let y = 0; y < world.h; y++) {
        for (let z = z0; z < z1; z++) {
            for (let x = x0; x < x1; x++) {
                const block = world.get(x, y, z);
                if (block === 0) continue;
                const [br, bg, bb] = LINEAR_COLORS[block] ?? LINEAR_COLORS[3];
                const jit = jitter(x, y, z);

                for (const face of FACES) {
                    const nx = x + face.dir[0];
                    const ny = y + face.dir[1];
                    const nz = z + face.dir[2];
                    if (world.isSolid(nx, ny, nz)) continue;

                    const ndx = positions.length / 3;
                    const ao: number[] = [];
                    for (const corner of face.corners) {
                        positions.push(x + corner[0], y + corner[1], z + corner[2]);
                        const a = vertexAO(world, x, y, z, face.dir, corner);
                        ao.push(a);
                        const l = face.shade * a * jit;
                        colors.push(br * l, bg * l, bb * l);
                    }
                    // Strip order a,b,c,d → quads (a,b,c)+(c,b,d). Flip the
                    // diagonal when AO would otherwise crease the wrong way.
                    if (ao[0] + ao[3] > ao[1] + ao[2]) {
                        indices.push(ndx, ndx + 1, ndx + 3, ndx, ndx + 3, ndx + 2);
                    } else {
                        indices.push(ndx, ndx + 1, ndx + 2, ndx + 2, ndx + 1, ndx + 3);
                    }
                }
            }
        }
    }

    if (indices.length === 0) return null;

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.setIndex(indices);
    geo.computeBoundingSphere();
    return geo;
}
