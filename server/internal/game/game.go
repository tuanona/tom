package game

import (
	"encoding/json"
	"log"
	"net/http"
	"strings"
	"sync"
	"time"

	"tom-server/internal/auth"
	"tom-server/internal/world"

	"github.com/gorilla/websocket"
	"github.com/jmoiron/sqlx"
)

var upgrader = websocket.Upgrader{
	EnableCompression: true,
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
}

const (
	snapshotInterval = 100 * time.Millisecond
	saveInterval     = 5 * time.Second
	maxChatLen       = 200
	// Build rate limit per client: maxEdits per editWindow.
	editWindow = time.Second
	maxEdits   = 25
)

// PlayerState is a 3D pose plus display name. Y is client-resolved
// (stand-on-terrain) and only clamped here.
type PlayerState struct {
	X    float64 `json:"x"`
	Y    float64 `json:"y"`
	Z    float64 `json:"z"`
	Ry   float64 `json:"ry"`
	Name string  `json:"name"`
}

// --- Outbound messages ---

type welcomeMsg struct {
	Type   string  `json:"type"`
	ID     string  `json:"id"`
	Name   string  `json:"name"`
	SpawnX float64 `json:"spawnX"`
	SpawnZ float64 `json:"spawnZ"`
}

type worldInitMsg struct {
	Type string `json:"type"`
	W    int    `json:"w"`
	H    int    `json:"h"`
	D    int    `json:"d"`
	Data []byte `json:"data"` // encoding/json emits base64
}

type snapshotMsg struct {
	Type    string                  `json:"type"`
	Players map[string]*PlayerState `json:"players"`
}

type chatMsg struct {
	Type    string `json:"type"`
	FromID  string `json:"fromId"`
	Name    string `json:"name"`
	Message string `json:"message"`
}

type blockMsg struct {
	Type  string `json:"type"` // BlockPlaced | BlockRemoved
	X     int    `json:"x"`
	Y     int    `json:"y"`
	Z     int    `json:"z"`
	Block int    `json:"block"`
}

// --- Inbound message (single shape, Type discriminates) ---

type clientMsg struct {
	Type    string  `json:"type"`
	X       float64 `json:"x"`
	Y       float64 `json:"y"`
	Z       float64 `json:"z"`
	Ry      float64 `json:"ry"`
	Block   int     `json:"block"`
	Message string  `json:"message"`
}

type Client struct {
	hub  *Hub
	conn *websocket.Conn
	send chan []byte
	id   string
	name string

	editWindowStart time.Time
	editCount       int
}

func (c *Client) allowEdit() bool {
	now := time.Now()
	if now.Sub(c.editWindowStart) > editWindow {
		c.editWindowStart = now
		c.editCount = 0
	}
	c.editCount++
	return c.editCount <= maxEdits
}

type Hub struct {
	clients    map[*Client]bool
	broadcast  chan []byte
	register   chan *Client
	unregister chan *Client

	players map[string]*PlayerState
	mu      sync.Mutex

	db    *sqlx.DB
	world *world.World
}

func NewHub(db *sqlx.DB, w *world.World) *Hub {
	return &Hub{
		broadcast:  make(chan []byte, 64),
		register:   make(chan *Client),
		unregister: make(chan *Client),
		clients:    make(map[*Client]bool),
		players:    make(map[string]*PlayerState),
		db:         db,
		world:      w,
	}
}

// fanout delivers a marshaled message to every client, dropping slow ones.
// Caller must hold h.mu.
func (h *Hub) fanout(message []byte) {
	for client := range h.clients {
		select {
		case client.send <- message:
		default:
			close(client.send)
			delete(h.clients, client)
		}
	}
}

func (h *Hub) Run() {
	snapTicker := time.NewTicker(snapshotInterval)
	saveTicker := time.NewTicker(saveInterval)
	defer snapTicker.Stop()
	defer saveTicker.Stop()

	for {
		select {
		case client := <-h.register:
			h.mu.Lock()
			h.clients[client] = true

			sx, sz := h.world.SpawnPoint()
			welcome, _ := json.Marshal(welcomeMsg{
				Type: "Welcome", ID: client.id, Name: client.name,
				SpawnX: sx, SpawnZ: sz,
			})
			worldInit, _ := json.Marshal(worldInitMsg{
				Type: "WorldInit",
				W:    h.world.W, H: h.world.H, D: h.world.D,
				Data: h.world.Snapshot(),
			})
			client.send <- welcome
			client.send <- worldInit

			if _, ok := h.players[client.id]; !ok {
				h.players[client.id] = &PlayerState{
					X: sx, Y: float64(h.world.H), Z: sz, Name: client.name,
				}
			}
			h.mu.Unlock()

		case client := <-h.unregister:
			h.mu.Lock()
			if _, ok := h.clients[client]; ok {
				delete(h.clients, client)
				close(client.send)
			}
			// Drop the avatar only when no other connection shares this id.
			stillHere := false
			for other := range h.clients {
				if other.id == client.id {
					stillHere = true
					break
				}
			}
			if !stillHere {
				delete(h.players, client.id)
			}
			h.mu.Unlock()

		case message := <-h.broadcast:
			h.mu.Lock()
			h.fanout(message)
			h.mu.Unlock()

		case <-snapTicker.C:
			h.mu.Lock()
			if len(h.clients) > 0 {
				snap, err := json.Marshal(snapshotMsg{Type: "Snapshot", Players: h.players})
				if err == nil {
					h.fanout(snap)
				}
			}
			h.mu.Unlock()

		case <-saveTicker.C:
			snap, dirty := h.world.TakeDirtySnapshot()
			if dirty {
				go func(data []byte) {
					if err := world.SaveBlob(h.db, h.world.W, h.world.H, h.world.D, data); err != nil {
						log.Println("world save failed:", err)
					}
				}(snap)
			}
		}
	}
}

func clamp(v, lo, hi float64) float64 {
	if v < lo {
		return lo
	}
	if v > hi {
		return hi
	}
	return v
}

// ServeWs authenticates the session token and joins the world.
func ServeWs(hub *Hub, w http.ResponseWriter, r *http.Request) {
	token := r.URL.Query().Get("token")
	id, name, ok := auth.ResolveWS(token)
	if !ok {
		http.Error(w, "unauthorized: invalid session token", http.StatusUnauthorized)
		return
	}

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println(err)
		return
	}
	client := &Client{hub: hub, conn: conn, send: make(chan []byte, 256), id: id, name: name}
	client.hub.register <- client

	go client.writePump()
	go client.readPump()
}

func (c *Client) readPump() {
	defer func() {
		c.hub.unregister <- c
		c.conn.Close()
	}()
	c.conn.SetReadLimit(4096)
	for {
		_, message, err := c.conn.ReadMessage()
		if err != nil {
			break
		}

		var msg clientMsg
		if err := json.Unmarshal(message, &msg); err != nil {
			continue
		}

		switch msg.Type {
		case "Move":
			h := c.hub
			h.mu.Lock()
			p, ok := h.players[c.id]
			if !ok {
				p = &PlayerState{Name: c.name}
				h.players[c.id] = p
			}
			p.X = clamp(msg.X, 0, float64(h.world.W))
			p.Y = clamp(msg.Y, 0, float64(h.world.H)+10)
			p.Z = clamp(msg.Z, 0, float64(h.world.D))
			p.Ry = msg.Ry
			h.mu.Unlock()
			// No broadcast here; the snapshot ticker carries movement.

		case "Chat":
			text := strings.TrimSpace(msg.Message)
			if text == "" {
				continue
			}
			if len(text) > maxChatLen {
				text = text[:maxChatLen]
			}
			out, _ := json.Marshal(chatMsg{Type: "Chat", FromID: c.id, Name: c.name, Message: text})
			c.hub.broadcast <- out

		case "PlaceBlock":
			if !c.allowEdit() {
				continue
			}
			if msg.Block < 1 || msg.Block > world.MaxBlockID {
				continue
			}
			x, y, z := int(msg.X), int(msg.Y), int(msg.Z)
			if c.hub.world.Set(x, y, z, byte(msg.Block)) {
				out, _ := json.Marshal(blockMsg{Type: "BlockPlaced", X: x, Y: y, Z: z, Block: msg.Block})
				c.hub.broadcast <- out
			}

		case "RemoveBlock":
			if !c.allowEdit() {
				continue
			}
			x, y, z := int(msg.X), int(msg.Y), int(msg.Z)
			if c.hub.world.Set(x, y, z, world.Air) {
				out, _ := json.Marshal(blockMsg{Type: "BlockRemoved", X: x, Y: y, Z: z, Block: 0})
				c.hub.broadcast <- out
			}
		}
	}
}

func (c *Client) writePump() {
	for message := range c.send {
		if err := c.conn.WriteMessage(websocket.TextMessage, message); err != nil {
			return
		}
	}
	c.conn.WriteMessage(websocket.CloseMessage, []byte{})
}
