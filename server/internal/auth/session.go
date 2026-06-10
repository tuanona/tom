package auth

import (
	"crypto/rand"
	"encoding/hex"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jmoiron/sqlx"
)

// Session ties a bearer token to a Telegram-derived identity.
type Session struct {
	Token     string `db:"token"`
	UserID    string `db:"user_id"`
	Name      string `db:"name"`
	CreatedAt int64  `db:"created_at"`
}

const sessionMaxAge = 30 * 24 * time.Hour

var (
	sessionsMu sync.RWMutex
	sessions   = make(map[string]Session)
	sessionDB  *sqlx.DB

	// DevMode is enabled when no BOT_TOKEN is configured: guests may join
	// the game WS without a Telegram identity (local development only).
	DevMode bool
)

// InitSessionStore loads persisted sessions into memory and prunes stale ones.
func InitSessionStore(db *sqlx.DB) error {
	sessionDB = db
	cutoff := time.Now().Add(-sessionMaxAge).Unix()
	if _, err := db.Exec("DELETE FROM sessions WHERE created_at < ?", cutoff); err != nil {
		return err
	}
	var rows []Session
	if err := db.Select(&rows, "SELECT token, user_id, name, created_at FROM sessions"); err != nil {
		return err
	}
	sessionsMu.Lock()
	for _, s := range rows {
		sessions[s.Token] = s
	}
	sessionsMu.Unlock()
	return nil
}

func randomHex(nBytes int) string {
	b := make([]byte, nBytes)
	if _, err := rand.Read(b); err != nil {
		// crypto/rand failing is unrecoverable for token generation
		panic(err)
	}
	return hex.EncodeToString(b)
}

// CreateSession mints a token for the given identity and persists it.
func CreateSession(userID, name string) string {
	s := Session{
		Token:     randomHex(16),
		UserID:    userID,
		Name:      name,
		CreatedAt: time.Now().Unix(),
	}
	sessionsMu.Lock()
	sessions[s.Token] = s
	sessionsMu.Unlock()
	if sessionDB != nil {
		sessionDB.Exec("INSERT OR REPLACE INTO sessions (token, user_id, name, created_at) VALUES (?, ?, ?, ?)",
			s.Token, s.UserID, s.Name, s.CreatedAt)
	}
	return s.Token
}

// ValidateToken resolves a bearer token to its session.
func ValidateToken(token string) (Session, bool) {
	if token == "" {
		return Session{}, false
	}
	sessionsMu.RLock()
	s, ok := sessions[token]
	sessionsMu.RUnlock()
	if !ok || time.Since(time.Unix(s.CreatedAt, 0)) > sessionMaxAge {
		return Session{}, false
	}
	return s, true
}

// ResolveWS maps a game-WebSocket token to an identity. In DevMode an
// unknown/empty token becomes a unique guest so the world stays testable
// without Telegram.
func ResolveWS(token string) (id, name string, ok bool) {
	if s, valid := ValidateToken(token); valid {
		return s.UserID, s.Name, true
	}
	if DevMode {
		suffix := randomHex(2)
		return "guest_" + suffix, "Tamu-" + suffix, true
	}
	return "", "", false
}

// Me returns the identity behind a token (query param or Bearer header).
func Me(c *gin.Context) {
	token := c.Query("token")
	if token == "" {
		h := c.GetHeader("Authorization")
		token = strings.TrimPrefix(h, "Bearer ")
	}
	s, ok := ValidateToken(token)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid or expired session"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"userId": s.UserID, "name": s.Name})
}
