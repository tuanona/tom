package world

import (
	"database/sql"
	"errors"
	"math"
	"sync"
	"time"

	"github.com/jmoiron/sqlx"
)

// Block type IDs. Must stay in sync with client/src/voxel/palette.ts.
const (
	Air    = 0
	Grass  = 1
	Dirt   = 2
	Stone  = 3
	Wood   = 4
	Leaves = 5
	// 6..15 are buildable color blocks (white, red, orange, yellow,
	// lime, blue, purple, pink, cyan, black).
	MaxBlockID = 15
)

// World holds the voxel grid for the shared island.
// Layout: idx = x + z*W + y*W*D (y-major planes).
type World struct {
	W, H, D int

	mu    sync.RWMutex
	data  []byte
	dirty bool
}

func New(w, h, d int, data []byte) *World {
	if data == nil {
		data = make([]byte, w*h*d)
	}
	return &World{W: w, H: h, D: d, data: data}
}

func (w *World) idx(x, y, z int) int {
	return x + z*w.W + y*w.W*w.D
}

func (w *World) inBounds(x, y, z int) bool {
	return x >= 0 && x < w.W && y >= 0 && y < w.H && z >= 0 && z < w.D
}

func (w *World) Get(x, y, z int) byte {
	if !w.inBounds(x, y, z) {
		return Air
	}
	w.mu.RLock()
	defer w.mu.RUnlock()
	return w.data[w.idx(x, y, z)]
}

// Set writes a block and marks the world dirty.
// Returns false when out of bounds or the value is unchanged.
func (w *World) Set(x, y, z int, b byte) bool {
	if !w.inBounds(x, y, z) {
		return false
	}
	w.mu.Lock()
	defer w.mu.Unlock()
	i := w.idx(x, y, z)
	if w.data[i] == b {
		return false
	}
	w.data[i] = b
	w.dirty = true
	return true
}

// Snapshot returns a copy of the raw grid (safe to encode/marshal).
func (w *World) Snapshot() []byte {
	w.mu.RLock()
	defer w.mu.RUnlock()
	cp := make([]byte, len(w.data))
	copy(cp, w.data)
	return cp
}

// TakeDirtySnapshot returns a copy and clears the dirty flag, or (nil,false)
// when nothing changed since the last save.
func (w *World) TakeDirtySnapshot() ([]byte, bool) {
	w.mu.Lock()
	defer w.mu.Unlock()
	if !w.dirty {
		return nil, false
	}
	cp := make([]byte, len(w.data))
	copy(cp, w.data)
	w.dirty = false
	return cp, true
}

// --- Persistence ---

func Load(db *sqlx.DB) (*World, error) {
	var row struct {
		W    int    `db:"w"`
		H    int    `db:"h"`
		D    int    `db:"d"`
		Data []byte `db:"data"`
	}
	err := db.Get(&row, "SELECT w, h, d, data FROM world WHERE id = 1")
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	if len(row.Data) != row.W*row.H*row.D {
		return nil, errors.New("world: stored grid size mismatch")
	}
	return New(row.W, row.H, row.D, row.Data), nil
}

func SaveBlob(db *sqlx.DB, w, h, d int, data []byte) error {
	_, err := db.Exec(`INSERT INTO world (id, w, h, d, data, updated_at)
		VALUES (1, ?, ?, ?, ?, ?)
		ON CONFLICT(id) DO UPDATE SET w=excluded.w, h=excluded.h, d=excluded.d,
			data=excluded.data, updated_at=excluded.updated_at`,
		w, h, d, data, time.Now().Unix())
	return err
}

// SaveIfDirty persists the grid when edits happened since the last save.
func (w *World) SaveIfDirty(db *sqlx.DB) error {
	snap, ok := w.TakeDirtySnapshot()
	if !ok {
		return nil
	}
	return SaveBlob(db, w.W, w.H, w.D, snap)
}

// --- Island generation ---

const genSeed uint32 = 1337

func hash2(x, z int, seed uint32) float64 {
	h := uint32(x)*374761393 + uint32(z)*668265263 + seed*974711
	h = (h ^ (h >> 13)) * 1274126177
	h ^= h >> 16
	return float64(h&0xffff) / 65535.0
}

func smooth(t float64) float64 { return t * t * (3 - 2*t) }

func valueNoise(x, z float64, seed uint32) float64 {
	ix, iz := math.Floor(x), math.Floor(z)
	fx, fz := x-ix, z-iz
	x0, z0 := int(ix), int(iz)
	a := hash2(x0, z0, seed)
	b := hash2(x0+1, z0, seed)
	c := hash2(x0, z0+1, seed)
	d := hash2(x0+1, z0+1, seed)
	sx, sz := smooth(fx), smooth(fz)
	top := a + (b-a)*sx
	bot := c + (d-c)*sx
	return top + (bot-top)*sz
}

// GenerateIsland builds the default floating island: a lens-shaped landmass
// with grass on top, dirt under it, a stone core tapering to stalactites,
// and a few trees.
func GenerateIsland() *World {
	const W, H, D = 64, 28, 64
	w := New(W, H, D, nil)

	cx, cz := float64(W)/2, float64(D)/2
	radius := float64(W)/2 - 4
	baseY := 14

	tops := make([]int, W*D)
	for i := range tops {
		tops[i] = -1
	}

	for x := 0; x < W; x++ {
		for z := 0; z < D; z++ {
			nx := (float64(x) + 0.5 - cx) / radius
			nz := (float64(z) + 0.5 - cz) / radius
			r := math.Sqrt(nx*nx + nz*nz)
			if r >= 1 {
				continue
			}
			falloff := 1 - r*r
			// Ragged coastline: random dropout near the rim.
			if falloff < 0.10 && hash2(x, z, genSeed+7) < 0.45 {
				continue
			}
			n1 := valueNoise(float64(x)*0.09, float64(z)*0.09, genSeed)
			n2 := valueNoise(float64(x)*0.23, float64(z)*0.23, genSeed+99)

			top := baseY + 1 + int(math.Round(falloff*(2.2+n1*4.5)))
			depth := 1 + int(math.Round(falloff*(5+n2*9)))
			bottom := baseY - depth
			if bottom < 0 {
				bottom = 0
			}
			if top >= H {
				top = H - 1
			}
			for y := bottom; y <= top; y++ {
				var b byte = Stone
				if y == top {
					b = Grass
				} else if y >= top-2 {
					b = Dirt
				}
				w.data[w.idx(x, y, z)] = b
			}
			tops[x+z*W] = top
		}
	}

	// Trees: deterministic scatter on inner grass.
	planted := 0
	for i := 0; i < 400 && planted < 12; i++ {
		x := 6 + int(hash2(i, 31, genSeed+13)*float64(W-12))
		z := 6 + int(hash2(i, 77, genSeed+29)*float64(D-12))
		top := tops[x+z*W]
		if top < 0 || w.data[w.idx(x, top, z)] != Grass {
			continue
		}
		nx := (float64(x) + 0.5 - cx) / radius
		nz := (float64(z) + 0.5 - cz) / radius
		if nx*nx+nz*nz > 0.45 { // keep trees away from the rim
			continue
		}
		trunkH := 3 + int(hash2(x, z, genSeed+41)*2)
		if top+trunkH+2 >= H {
			continue
		}
		for t := 1; t <= trunkH; t++ {
			w.data[w.idx(x, top+t, z)] = Wood
		}
		ty := top + trunkH
		for dx := -1; dx <= 1; dx++ {
			for dz := -1; dz <= 1; dz++ {
				for dy := 0; dy <= 1; dy++ {
					if dy == 1 && dx != 0 && dz != 0 {
						continue // round the crown
					}
					px, py, pz := x+dx, ty+dy, z+dz
					if w.inBounds(px, py, pz) && w.data[w.idx(px, py, pz)] == Air {
						w.data[w.idx(px, py, pz)] = Leaves
					}
				}
			}
		}
		w.data[w.idx(x, ty+2, z)] = Leaves
		planted++
	}

	w.dirty = true
	return w
}

// SpawnPoint returns the center-top of the island (x, z block centers).
func (w *World) SpawnPoint() (float64, float64) {
	return float64(w.W)/2 + 0.5, float64(w.D)/2 + 0.5
}
