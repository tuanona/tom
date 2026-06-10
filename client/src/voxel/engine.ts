import * as THREE from 'three';
import { VoxelWorld } from './world';
import { buildChunkGeometry, CHUNK } from './mesher';
import type { PlayerState } from '../lib/protocol';

// Imperative Three.js engine. React only renders the HUD around it.
//
// Performance posture (Telegram WebView / low-end Android):
// - island = merged geometry per 16x16 chunk, face-culled, AO+sun baked
//   into vertex colors → MeshBasicMaterial (no realtime lighting, no shadows)
// - pixelRatio capped at 2, antialias off
// - lights only affect the handful of avatar boxes (Lambert)

export interface EngineCallbacks {
    onMove(x: number, y: number, z: number, ry: number): void;
    onEdit(x: number, y: number, z: number, block: number, action: 'place' | 'remove'): void;
    onJoystick?(state: { active: boolean; baseX: number; baseY: number; dx: number; dy: number }): void;
}

interface Avatar {
    group: THREE.Group;
    target: { x: number; y: number; z: number; ry: number };
    nameSprite: THREE.Sprite;
    bubble: THREE.Sprite | null;
    bubbleExpire: number;
    materials: THREE.Material[];
    textures: THREE.Texture[];
}

interface PointerInfo {
    id: number;
    x0: number;
    y0: number;
    x: number;
    y: number;
    t0: number;
    mode: 'pending' | 'joystick' | 'orbit' | 'pinch' | 'consumed';
    isTouch: boolean;
}

const MOVE_SPEED = 4.5; // blocks/s
const SEND_INTERVAL = 100; // ms
const BUBBLE_TTL = 4000; // ms

function hashHue(s: string): number {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return ((h % 360) + 360) % 360;
}

function makeTextSprite(text: string, opts: { fontPx: number; pad: number; bg: string | null; fg: string }): {
    sprite: THREE.Sprite;
    texture: THREE.Texture;
    material: THREE.SpriteMaterial;
    aspect: number;
} {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;
    const font = `600 ${opts.fontPx}px system-ui, sans-serif`;
    ctx.font = font;
    const textW = Math.ceil(ctx.measureText(text).width);
    const w = textW + opts.pad * 2;
    const h = opts.fontPx + opts.pad * 2;
    canvas.width = w * 2; // 2x for crispness
    canvas.height = h * 2;
    const c2 = canvas.getContext('2d')!;
    c2.scale(2, 2);
    if (opts.bg) {
        c2.fillStyle = opts.bg;
        const r = Math.min(10, h / 2);
        c2.beginPath();
        c2.roundRect(0, 0, w, h, r);
        c2.fill();
    }
    c2.font = font;
    c2.textAlign = 'center';
    c2.textBaseline = 'middle';
    c2.fillStyle = opts.fg;
    c2.fillText(text, w / 2, h / 2 + 1);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    const material = new THREE.SpriteMaterial({ map: texture, depthTest: true, transparent: true });
    const sprite = new THREE.Sprite(material);
    return { sprite, texture, material, aspect: w / h };
}

export class VoxelEngine {
    private canvas: HTMLCanvasElement;
    private cb: EngineCallbacks;
    private renderer: THREE.WebGLRenderer;
    private scene: THREE.Scene;
    private camera: THREE.PerspectiveCamera;
    private raf = 0;
    private clock = new THREE.Clock();
    private disposed = false;

    private world: VoxelWorld | null = null;
    private islandGroup = new THREE.Group();
    private chunkMeshes = new Map<string, THREE.Mesh>();
    private islandMaterial = new THREE.MeshBasicMaterial({ vertexColors: true });

    private avatars = new Map<string, Avatar>();
    private avatarGeo = new THREE.BoxGeometry(1, 1, 1);
    private headGeo = new THREE.SphereGeometry(0.5, 14, 12);

    private myId: string | null = null;
    private myName = '';
    private me: THREE.Group | null = null;
    private meAvatar: Avatar | null = null;
    private myPos = new THREE.Vector3(0, 30, 0);
    private myRy = 0;
    private pendingSpawn: { x: number; z: number } | null = null;
    private lastSent = 0;
    private lastSentState = { x: NaN, y: NaN, z: NaN, ry: NaN };

    // camera orbit
    private camYaw = 0.7;
    private camPitch = 0.85;
    private camDist = 14;

    // input
    private keys = new Set<string>();
    private joyInput = new THREE.Vector2(0, 0);
    private pointers = new Map<number, PointerInfo>();
    private pinchStartDist = 0;
    private pinchStartCamDist = 14;

    // build
    buildMode = false;
    removeMode = false;
    selectedBlock = 11;
    private highlight: THREE.LineSegments;
    private raycaster = new THREE.Raycaster();

    private clouds: THREE.Mesh[] = [];

    constructor(canvas: HTMLCanvasElement, cb: EngineCallbacks) {
        this.canvas = canvas;
        this.cb = cb;

        this.renderer = new THREE.WebGLRenderer({
            canvas,
            antialias: false,
            powerPreference: 'high-performance',
        });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color('#a5d8ff');
        this.scene.fog = new THREE.Fog('#c4e4ff', 70, 160);

        this.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 300);

        // Lights only matter for avatars (island lighting is baked).
        this.scene.add(new THREE.HemisphereLight(0xffffff, 0x6b7a8c, 1.1));
        const sun = new THREE.DirectionalLight(0xffffff, 1.2);
        sun.position.set(40, 80, 20);
        this.scene.add(sun);

        this.scene.add(this.islandGroup);

        const hl = new THREE.LineSegments(
            new THREE.EdgesGeometry(new THREE.BoxGeometry(1.002, 1.002, 1.002)),
            new THREE.LineBasicMaterial({ color: 0xffffff }),
        );
        hl.visible = false;
        this.scene.add(hl);
        this.highlight = hl;

        this.makeClouds();
        this.bindEvents();
        this.resize();
        this.raf = requestAnimationFrame(this.loop);
    }

    // --- world ---

    setWorld(w: number, h: number, d: number, data: Uint8Array) {
        this.world = new VoxelWorld(w, h, d, data);
        for (const m of this.chunkMeshes.values()) {
            this.islandGroup.remove(m);
            m.geometry.dispose();
        }
        this.chunkMeshes.clear();
        const cw = Math.ceil(w / CHUNK);
        const cd = Math.ceil(d / CHUNK);
        for (let cx = 0; cx < cw; cx++) {
            for (let cz = 0; cz < cd; cz++) {
                this.remeshChunk(cx, cz);
            }
        }
        if (this.pendingSpawn) {
            this.placeMyAvatarAt(this.pendingSpawn.x, this.pendingSpawn.z);
            this.pendingSpawn = null;
        }
    }

    private remeshChunk(cx: number, cz: number) {
        if (!this.world) return;
        const key = `${cx},${cz}`;
        const old = this.chunkMeshes.get(key);
        if (old) {
            this.islandGroup.remove(old);
            old.geometry.dispose();
            this.chunkMeshes.delete(key);
        }
        const geo = buildChunkGeometry(this.world, cx, cz);
        if (!geo) return;
        const mesh = new THREE.Mesh(geo, this.islandMaterial);
        this.chunkMeshes.set(key, mesh);
        this.islandGroup.add(mesh);
    }

    // applyBlock mutates the grid and remeshes the affected chunk(s).
    // Idempotent: server echo of our optimistic edit is a no-op.
    applyBlock(x: number, y: number, z: number, block: number) {
        if (!this.world) return;
        if (!this.world.set(x, y, z, block)) return;
        const cx = Math.floor(x / CHUNK);
        const cz = Math.floor(z / CHUNK);
        this.remeshChunk(cx, cz);
        // Borders: neighbor chunk faces may appear/disappear.
        if (x % CHUNK === 0 && cx > 0) this.remeshChunk(cx - 1, cz);
        if (x % CHUNK === CHUNK - 1) this.remeshChunk(cx + 1, cz);
        if (z % CHUNK === 0 && cz > 0) this.remeshChunk(cx, cz - 1);
        if (z % CHUNK === CHUNK - 1) this.remeshChunk(cx, cz + 1);
    }

    // --- identity & avatars ---

    setMyIdentity(id: string, name: string, spawnX: number, spawnZ: number) {
        this.myId = id;
        this.myName = name;
        if (this.world) {
            this.placeMyAvatarAt(spawnX, spawnZ);
        } else {
            this.pendingSpawn = { x: spawnX, z: spawnZ };
        }
    }

    private placeMyAvatarAt(x: number, z: number) {
        const y = this.groundY(x, z) ?? 20;
        this.myPos.set(x, y, z);
        if (!this.me) {
            const av = this.makeAvatar(this.myId ?? 'me', this.myName);
            this.me = av.group;
            this.meAvatar = av;
            this.scene.add(av.group);
        }
        this.me.position.copy(this.myPos);
    }

    private makeAvatar(id: string, name: string): Avatar {
        const hue = hashHue(id);
        const bodyColor = new THREE.Color().setHSL(hue / 360, 0.6, 0.55);
        const legColor = bodyColor.clone().multiplyScalar(0.55);
        const headColor = new THREE.Color().setHSL(hue / 360, 0.45, 0.72);

        const mLeg = new THREE.MeshLambertMaterial({ color: legColor });
        const mBody = new THREE.MeshLambertMaterial({ color: bodyColor });
        const mHead = new THREE.MeshLambertMaterial({ color: headColor });
        const mNose = new THREE.MeshLambertMaterial({ color: 0x333333 });

        const group = new THREE.Group();
        const legs = new THREE.Mesh(this.avatarGeo, mLeg);
        legs.scale.set(0.45, 0.55, 0.3);
        legs.position.y = 0.275;
        const body = new THREE.Mesh(this.avatarGeo, mBody);
        body.scale.set(0.6, 0.65, 0.38);
        body.position.y = 0.875;
        // Round head: sticker-soft, matches Telegram gift art better than a cube.
        const head = new THREE.Mesh(this.headGeo, mHead);
        head.scale.set(0.62, 0.58, 0.62);
        head.position.y = 1.5;
        // Nose marks the facing direction (+z forward).
        const nose = new THREE.Mesh(this.avatarGeo, mNose);
        nose.scale.set(0.1, 0.1, 0.07);
        nose.position.set(0, 1.5, 0.32);
        group.add(legs, body, head, nose);

        const label = makeTextSprite(name || id.slice(0, 8), {
            fontPx: 28, pad: 10, bg: 'rgba(15,23,42,0.55)', fg: '#ffffff',
        });
        label.sprite.position.y = 2.15;
        label.sprite.scale.set(0.55 * label.aspect, 0.55, 1);
        group.add(label.sprite);

        return {
            group,
            target: { x: 0, y: 0, z: 0, ry: 0 },
            nameSprite: label.sprite,
            bubble: null,
            bubbleExpire: 0,
            materials: [mLeg, mBody, mHead, mNose, label.material],
            textures: [label.texture],
        };
    }

    private disposeAvatar(av: Avatar) {
        if (av.bubble) av.group.remove(av.bubble);
        for (const m of av.materials) m.dispose();
        for (const t of av.textures) t.dispose();
    }

    updatePlayers(players: Record<string, PlayerState>) {
        const seen = new Set<string>();
        for (const [id, p] of Object.entries(players)) {
            if (id === this.myId) continue;
            seen.add(id);
            let av = this.avatars.get(id);
            if (!av) {
                av = this.makeAvatar(id, p.name);
                av.group.position.set(p.x, p.y, p.z);
                this.avatars.set(id, av);
                this.scene.add(av.group);
            }
            av.target = { x: p.x, y: p.y, z: p.z, ry: p.ry };
        }
        for (const [id, av] of this.avatars) {
            if (!seen.has(id)) {
                this.scene.remove(av.group);
                this.disposeAvatar(av);
                this.avatars.delete(id);
            }
        }
    }

    showBubble(id: string, text: string) {
        const av = id === this.myId ? this.meAvatar : this.avatars.get(id);
        if (!av) return;
        if (av.bubble) {
            av.group.remove(av.bubble);
            av.bubble.material.map?.dispose();
            av.bubble.material.dispose();
            av.bubble = null;
        }
        const short = text.length > 40 ? text.slice(0, 39) + '…' : text;
        const b = makeTextSprite(short, { fontPx: 26, pad: 12, bg: 'rgba(255,255,255,0.95)', fg: '#1e293b' });
        b.sprite.position.y = 2.7;
        b.sprite.scale.set(0.6 * b.aspect, 0.6, 1);
        av.group.add(b.sprite);
        av.bubble = b.sprite;
        av.bubbleExpire = performance.now() + BUBBLE_TTL;
    }

    // --- terrain helpers ---

    private groundY(x: number, z: number): number | null {
        if (!this.world) return null;
        const top = this.world.topSolidY(Math.floor(x), Math.floor(z));
        if (top < 0) return null;
        return top + 1;
    }

    // --- input ---

    private bindEvents() {
        window.addEventListener('keydown', this.onKeyDown);
        window.addEventListener('keyup', this.onKeyUp);
        window.addEventListener('resize', this.resize);
        this.canvas.addEventListener('pointerdown', this.onPointerDown);
        this.canvas.addEventListener('pointermove', this.onPointerMove);
        this.canvas.addEventListener('pointerup', this.onPointerUp);
        this.canvas.addEventListener('pointercancel', this.onPointerUp);
        this.canvas.addEventListener('wheel', this.onWheel, { passive: false });
        this.canvas.addEventListener('contextmenu', this.onContextMenu);
    }

    private unbindEvents() {
        window.removeEventListener('keydown', this.onKeyDown);
        window.removeEventListener('keyup', this.onKeyUp);
        window.removeEventListener('resize', this.resize);
        this.canvas.removeEventListener('pointerdown', this.onPointerDown);
        this.canvas.removeEventListener('pointermove', this.onPointerMove);
        this.canvas.removeEventListener('pointerup', this.onPointerUp);
        this.canvas.removeEventListener('pointercancel', this.onPointerUp);
        this.canvas.removeEventListener('wheel', this.onWheel);
        this.canvas.removeEventListener('contextmenu', this.onContextMenu);
    }

    private isTypingTarget(): boolean {
        const el = document.activeElement;
        return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA');
    }

    private onKeyDown = (e: KeyboardEvent) => {
        if (this.isTypingTarget()) return;
        this.keys.add(e.key.toLowerCase());
    };

    private onKeyUp = (e: KeyboardEvent) => {
        this.keys.delete(e.key.toLowerCase());
    };

    private onContextMenu = (e: Event) => e.preventDefault();

    private onWheel = (e: WheelEvent) => {
        e.preventDefault();
        this.camDist = THREE.MathUtils.clamp(this.camDist + e.deltaY * 0.02, 5, 32);
    };

    private onPointerDown = (e: PointerEvent) => {
        this.canvas.setPointerCapture(e.pointerId);
        const info: PointerInfo = {
            id: e.pointerId, x0: e.clientX, y0: e.clientY,
            x: e.clientX, y: e.clientY, t0: performance.now(),
            mode: 'pending', isTouch: e.pointerType === 'touch',
        };
        this.pointers.set(e.pointerId, info);

        // Right mouse button removes instantly in build mode.
        if (!info.isTouch && e.button === 2 && this.buildMode) {
            this.raycastEdit(e.clientX, e.clientY, 'remove');
            info.mode = 'consumed';
            return;
        }

        // Two touches → pinch zoom.
        const touches = [...this.pointers.values()].filter(p => p.isTouch && p.mode !== 'consumed');
        if (touches.length === 2) {
            for (const t of touches) t.mode = 'pinch';
            this.pinchStartDist = Math.hypot(touches[0].x - touches[1].x, touches[0].y - touches[1].y);
            this.pinchStartCamDist = this.camDist;
            this.setJoystick(null);
        }
    };

    private onPointerMove = (e: PointerEvent) => {
        const info = this.pointers.get(e.pointerId);
        if (!info) {
            // Hover: update the build highlight on desktop.
            if (this.buildMode && e.pointerType !== 'touch') this.updateHighlight(e.clientX, e.clientY);
            return;
        }
        info.x = e.clientX;
        info.y = e.clientY;

        if (info.mode === 'pending') {
            const dist = Math.hypot(info.x - info.x0, info.y - info.y0);
            if (dist > 10) {
                const rect = this.canvas.getBoundingClientRect();
                const leftZone = info.x0 - rect.left < rect.width * 0.45;
                const lowerZone = info.y0 - rect.top > rect.height * 0.3;
                info.mode = info.isTouch && leftZone && lowerZone ? 'joystick' : 'orbit';
            }
        }

        if (info.mode === 'joystick') {
            const dx = info.x - info.x0;
            const dy = info.y - info.y0;
            const r = 56;
            const v = new THREE.Vector2(dx / r, dy / r);
            if (v.length() > 1) v.normalize();
            this.joyInput.copy(v);
            this.setJoystick({ active: true, baseX: info.x0, baseY: info.y0, dx: v.x * r, dy: v.y * r });
        } else if (info.mode === 'orbit') {
            const mx = e.movementX ?? 0;
            const my = e.movementY ?? 0;
            this.camYaw -= mx * 0.005;
            this.camPitch = THREE.MathUtils.clamp(this.camPitch - my * 0.004, 0.35, 1.3);
        } else if (info.mode === 'pinch') {
            const touches = [...this.pointers.values()].filter(p => p.mode === 'pinch');
            if (touches.length === 2 && this.pinchStartDist > 0) {
                const d = Math.hypot(touches[0].x - touches[1].x, touches[0].y - touches[1].y);
                this.camDist = THREE.MathUtils.clamp(
                    this.pinchStartCamDist * (this.pinchStartDist / Math.max(d, 1)), 5, 32);
            }
        }

        if (this.buildMode && !info.isTouch) this.updateHighlight(e.clientX, e.clientY);
    };

    private onPointerUp = (e: PointerEvent) => {
        const info = this.pointers.get(e.pointerId);
        this.pointers.delete(e.pointerId);
        if (!info) return;

        if (info.mode === 'joystick') {
            this.joyInput.set(0, 0);
            this.setJoystick(null);
            return;
        }
        if (info.mode === 'pending') {
            const quick = performance.now() - info.t0 < 400;
            if (quick && this.buildMode && e.button !== 2) {
                this.raycastEdit(info.x, info.y, this.removeMode ? 'remove' : 'place');
            }
        }
    };

    private setJoystick(state: { active: boolean; baseX: number; baseY: number; dx: number; dy: number } | null) {
        this.cb.onJoystick?.(state ?? { active: false, baseX: 0, baseY: 0, dx: 0, dy: 0 });
    }

    // --- building ---

    private pickVoxel(clientX: number, clientY: number): {
        remove: [number, number, number];
        place: [number, number, number];
    } | null {
        if (!this.world) return null;
        const rect = this.canvas.getBoundingClientRect();
        const ndc = new THREE.Vector2(
            ((clientX - rect.left) / rect.width) * 2 - 1,
            -((clientY - rect.top) / rect.height) * 2 + 1,
        );
        this.raycaster.setFromCamera(ndc, this.camera);
        const hits = this.raycaster.intersectObjects(this.islandGroup.children, false);
        const hit = hits[0];
        if (!hit || !hit.face) return null;
        const n = hit.face.normal;
        const p = hit.point;
        const remove: [number, number, number] = [
            Math.floor(p.x - n.x * 0.5),
            Math.floor(p.y - n.y * 0.5),
            Math.floor(p.z - n.z * 0.5),
        ];
        const place: [number, number, number] = [
            Math.floor(p.x + n.x * 0.5),
            Math.floor(p.y + n.y * 0.5),
            Math.floor(p.z + n.z * 0.5),
        ];
        return { remove, place };
    }

    private updateHighlight(clientX: number, clientY: number) {
        const pick = this.pickVoxel(clientX, clientY);
        if (!pick) {
            this.highlight.visible = false;
            return;
        }
        const [x, y, z] = this.removeMode ? pick.remove : pick.place;
        this.highlight.position.set(x + 0.5, y + 0.5, z + 0.5);
        this.highlight.visible = true;
    }

    private raycastEdit(clientX: number, clientY: number, action: 'place' | 'remove') {
        const pick = this.pickVoxel(clientX, clientY);
        if (!pick || !this.world) return;
        const [x, y, z] = action === 'remove' ? pick.remove : pick.place;
        if (!this.world.inBounds(x, y, z)) return;

        if (action === 'place') {
            // Don't build inside your own body.
            const mx = Math.floor(this.myPos.x);
            const mz = Math.floor(this.myPos.z);
            const my = Math.floor(this.myPos.y);
            if (x === mx && z === mz && (y === my || y === my + 1)) return;
            this.applyBlock(x, y, z, this.selectedBlock); // optimistic
            this.cb.onEdit(x, y, z, this.selectedBlock, 'place');
        } else {
            this.applyBlock(x, y, z, 0); // optimistic
            this.cb.onEdit(x, y, z, 0, 'remove');
        }
    }

    // --- decoration ---

    private makeClouds() {
        const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 });
        const geo = new THREE.BoxGeometry(1, 1, 1);
        const places: [number, number, number, number][] = [
            [-20, 26, -30, 7], [70, 30, 10, 9], [20, 24, 85, 6],
            [90, 22, 70, 8], [-25, 28, 55, 5],
        ];
        for (const [x, y, z, s] of places) {
            const m = new THREE.Mesh(geo, mat);
            m.scale.set(s, 1.4, s * 0.6);
            m.position.set(x, y, z);
            this.scene.add(m);
            this.clouds.push(m);
        }
    }

    // --- frame loop ---

    private resize = () => {
        const w = this.canvas.clientWidth || window.innerWidth;
        const h = this.canvas.clientHeight || window.innerHeight;
        this.renderer.setSize(w, h, false);
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
    };

    private loop = () => {
        if (this.disposed) return;
        this.raf = requestAnimationFrame(this.loop);
        const dt = Math.min(this.clock.getDelta(), 0.1);
        const now = performance.now();

        this.updateMyMovement(dt, now);
        this.updateRemotes(dt, now);
        this.updateCamera();

        for (const c of this.clouds) {
            c.position.x += dt * 0.4;
            if (c.position.x > 120) c.position.x = -60;
        }

        this.renderer.render(this.scene, this.camera);
    };

    private updateMyMovement(dt: number, now: number) {
        if (!this.world || !this.me) return;

        // keyboard + joystick → input vector (x = strafe, y = forward)
        let ix = 0;
        let iy = 0;
        if (this.keys.has('w') || this.keys.has('arrowup')) iy += 1;
        if (this.keys.has('s') || this.keys.has('arrowdown')) iy -= 1;
        if (this.keys.has('a') || this.keys.has('arrowleft')) ix -= 1;
        if (this.keys.has('d') || this.keys.has('arrowright')) ix += 1;
        ix += this.joyInput.x;
        iy += -this.joyInput.y; // screen up = forward
        const inputLen = Math.hypot(ix, iy);
        if (inputLen > 1) {
            ix /= inputLen;
            iy /= inputLen;
        }

        if (inputLen > 0.05) {
            const sinY = Math.sin(this.camYaw);
            const cosY = Math.cos(this.camYaw);
            // camera sits at target + (sinYaw, cosYaw)*dist → forward = -(sin,cos)
            const fwd = new THREE.Vector2(-sinY, -cosY);
            const right = new THREE.Vector2(cosY, -sinY);
            const move = new THREE.Vector2(
                fwd.x * iy + right.x * ix,
                fwd.y * iy + right.y * ix,
            ).multiplyScalar(MOVE_SPEED * dt);

            // axis-separable: allows sliding along the island edge
            const tryX = this.myPos.x + move.x;
            if (this.groundY(tryX, this.myPos.z) !== null) this.myPos.x = tryX;
            const tryZ = this.myPos.z + move.y;
            if (this.groundY(this.myPos.x, tryZ) !== null) this.myPos.z = tryZ;

            this.myRy = Math.atan2(move.x, move.y);
        }

        // stand on terrain (placed/removed blocks update this live)
        const gy = this.groundY(this.myPos.x, this.myPos.z);
        if (gy !== null) {
            this.myPos.y += (gy - this.myPos.y) * Math.min(1, dt * 14);
        }

        this.me.position.copy(this.myPos);
        const targetQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.myRy);
        this.me.quaternion.slerp(targetQ, Math.min(1, dt * 12));

        // bubbles ttl (self)
        if (this.meAvatar?.bubble && now > this.meAvatar.bubbleExpire) {
            this.meAvatar.group.remove(this.meAvatar.bubble);
            this.meAvatar.bubble = null;
        }

        // throttled network send
        if (now - this.lastSent > SEND_INTERVAL) {
            const s = this.lastSentState;
            const changed =
                Math.abs(s.x - this.myPos.x) > 0.01 ||
                Math.abs(s.y - this.myPos.y) > 0.01 ||
                Math.abs(s.z - this.myPos.z) > 0.01 ||
                Math.abs(s.ry - this.myRy) > 0.02;
            if (changed || Number.isNaN(s.x)) {
                this.cb.onMove(this.myPos.x, this.myPos.y, this.myPos.z, this.myRy);
                this.lastSentState = { x: this.myPos.x, y: this.myPos.y, z: this.myPos.z, ry: this.myRy };
                this.lastSent = now;
            }
        }
    }

    private updateRemotes(dt: number, now: number) {
        const k = 1 - Math.exp(-dt * 10);
        for (const av of this.avatars.values()) {
            const g = av.group;
            g.position.x += (av.target.x - g.position.x) * k;
            g.position.y += (av.target.y - g.position.y) * k;
            g.position.z += (av.target.z - g.position.z) * k;
            const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), av.target.ry);
            g.quaternion.slerp(q, k);
            if (av.bubble && now > av.bubbleExpire) {
                g.remove(av.bubble);
                av.bubble = null;
            }
        }
    }

    private updateCamera() {
        const target = this.me ? this.myPos : new THREE.Vector3(32, 18, 32);
        const cp = Math.cos(this.camPitch);
        const offset = new THREE.Vector3(
            Math.sin(this.camYaw) * cp,
            Math.sin(this.camPitch),
            Math.cos(this.camYaw) * cp,
        ).multiplyScalar(this.camDist);
        this.camera.position.copy(target).add(offset).add(new THREE.Vector3(0, 1.2, 0));
        this.camera.lookAt(target.x, target.y + 1.2, target.z);
    }

    setBuildMode(on: boolean) {
        this.buildMode = on;
        if (!on) this.highlight.visible = false;
    }

    dispose() {
        this.disposed = true;
        cancelAnimationFrame(this.raf);
        this.unbindEvents();
        for (const m of this.chunkMeshes.values()) m.geometry.dispose();
        this.chunkMeshes.clear();
        for (const av of this.avatars.values()) this.disposeAvatar(av);
        this.avatars.clear();
        if (this.meAvatar) this.disposeAvatar(this.meAvatar);
        this.islandMaterial.dispose();
        this.avatarGeo.dispose();
        this.headGeo.dispose();
        this.highlight.geometry.dispose();
        (this.highlight.material as THREE.Material).dispose();
        this.renderer.dispose();
    }
}
