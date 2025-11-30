package game

import (
	"encoding/json"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"github.com/jmoiron/sqlx"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
}

type PlayerPosition struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
}

type GameUpdate struct {
	Type    string                    `json:"type"`
	ID      string                    `json:"id,omitempty"`
	Players map[string]PlayerPosition `json:"players,omitempty"`
	Message string                    `json:"message,omitempty"`
	FromID  string                    `json:"fromId,omitempty"`
}

type Client struct {
	hub  *Hub
	conn *websocket.Conn
	send chan []byte
	id   string
}

type Hub struct {
	clients    map[*Client]bool
	broadcast  chan []byte
	register   chan *Client
	unregister chan *Client
	players    map[string]PlayerPosition
	mu         sync.Mutex
	db         *sqlx.DB
}

func NewHub(db *sqlx.DB) *Hub {
	return &Hub{
		broadcast:  make(chan []byte),
		register:   make(chan *Client),
		unregister: make(chan *Client),
		clients:    make(map[*Client]bool),
		players:    make(map[string]PlayerPosition),
		db:         db,
	}
}

func (h *Hub) Run() {
	for {
		select {
		case client := <-h.register:
			h.mu.Lock()
			h.clients[client] = true
			h.mu.Unlock()

			// Send Welcome
			welcome := GameUpdate{Type: "Welcome", ID: client.id}
			msg, _ := json.Marshal(welcome)
			client.send <- msg

			// Send World State
			h.mu.Lock()
			update := GameUpdate{Type: "WorldUpdate", Players: h.players}
			h.mu.Unlock()
			msg, _ = json.Marshal(update)
			client.send <- msg

		case client := <-h.unregister:
			h.mu.Lock()
			if _, ok := h.clients[client]; ok {
				delete(h.clients, client)
				close(client.send)
			}
			h.mu.Unlock()

		case message := <-h.broadcast:
			h.mu.Lock()
			for client := range h.clients {
				select {
				case client.send <- message:
				default:
					close(client.send)
					delete(h.clients, client)
				}
			}
			h.mu.Unlock()
		}
	}
}

func ServeWs(hub *Hub, w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println(err)
		return
	}
	client := &Client{hub: hub, conn: conn, send: make(chan []byte, 256), id: "user_" + time.Now().Format("150405")}
	client.hub.register <- client

	go client.writePump()
	go client.readPump()
}

func (c *Client) readPump() {
	defer func() {
		c.hub.unregister <- c
		c.conn.Close()
	}()
	for {
		_, message, err := c.conn.ReadMessage()
		if err != nil {
			break
		}

		var msg struct {
			Type    string  `json:"type"`
			X       float64 `json:"x"`
			Y       float64 `json:"y"`
			Message string  `json:"message"`
		}

		if err := json.Unmarshal(message, &msg); err == nil {
			if msg.Type == "Move" {
				c.hub.mu.Lock()
				c.hub.players[c.id] = PlayerPosition{X: msg.X, Y: msg.Y}
				update := GameUpdate{Type: "WorldUpdate", Players: c.hub.players}
				c.hub.mu.Unlock()

				bytes, _ := json.Marshal(update)
				c.hub.broadcast <- bytes
			} else if msg.Type == "Chat" {
				chatMsg := GameUpdate{
					Type:    "Chat",
					FromID:  c.id,
					Message: msg.Message,
				}
				bytes, _ := json.Marshal(chatMsg)
				c.hub.broadcast <- bytes
			}
		}
	}
}

func (c *Client) writePump() {
	for {
		select {
		case message, ok := <-c.send:
			if !ok {
				c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			c.conn.WriteMessage(websocket.TextMessage, message)
		}
	}
}
