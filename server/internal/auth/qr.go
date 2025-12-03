package auth

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

// QRSession stores the state of a QR login attempt
type QRSession struct {
	ID        string    `json:"id"`
	Status    string    `json:"status"` // "pending", "authenticated", "expired"
	UserID    string    `json:"userId,omitempty"`
	CreatedAt time.Time `json:"createdAt"`
}

var (
	qrSessions = make(map[string]*QRSession)
	qrMutex    sync.Mutex
)

// InitQR creates a new QR session
func InitQR(c *gin.Context) {
	bytes := make([]byte, 16)
	if _, err := rand.Read(bytes); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate session ID"})
		return
	}
	id := hex.EncodeToString(bytes)

	session := &QRSession{
		ID:        id,
		Status:    "pending",
		CreatedAt: time.Now(),
	}

	qrMutex.Lock()
	qrSessions[id] = session
	qrMutex.Unlock()

	// Cleanup old sessions (simple implementation)
	go func() {
		time.Sleep(5 * time.Minute)
		qrMutex.Lock()
		delete(qrSessions, id)
		qrMutex.Unlock()
	}()

	c.JSON(http.StatusOK, gin.H{
		"id":  id,
		"url": "https://t.me/TomGameBot?start=login_" + id, // Placeholder Bot Username
	})
}

// PollQR checks the status of a QR session
func PollQR(c *gin.Context) {
	id := c.Query("id")
	if id == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Missing id"})
		return
	}

	qrMutex.Lock()
	session, exists := qrSessions[id]
	qrMutex.Unlock()

	if !exists {
		c.JSON(http.StatusNotFound, gin.H{"error": "Session not found"})
		return
	}

	if session.Status == "authenticated" {
		// Return the session token (mock for now, should be JWT)
		c.JSON(http.StatusOK, gin.H{
			"status": "authenticated",
			"token":  "mock_token_" + session.UserID,
			"userId": session.UserID,
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": session.Status})
}

// ScanQR handles the scanning of the QR code by the TMA
func ScanQR(c *gin.Context) {
	id := c.Query("id")
	var req struct {
		InitData   string `json:"initData"`
		InviteCode string `json:"inviteCode,omitempty"`
	}

	if err := c.BindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request"})
		return
	}

	qrMutex.Lock()
	session, exists := qrSessions[id]
	qrMutex.Unlock()

	if !exists {
		c.JSON(http.StatusNotFound, gin.H{"error": "Session not found"})
		return
	}

	// Parse user data
	parsedData, _ := url.ParseQuery(req.InitData)
	userJSON := parsedData.Get("user")
	var user struct {
		ID        int64  `json:"id"`
		FirstName string `json:"first_name"`
		Username  string `json:"username"`
	}

	if userJSON != "" {
		json.Unmarshal([]byte(userJSON), &user)
	} else {
		// Fallback for dev/mock
		user.ID = 12345
		user.FirstName = "Dev"
		user.Username = "dev_user"
	}

	userIDStr := fmt.Sprintf("user_%d", user.ID)

	// Check hardcoded admin (set on server startup)
	isHardcodedAdmin := (HardcodedAdminID != 0 && user.ID == HardcodedAdminID)

	// Check if user is the claimed admin
	mu.RLock()
	isClaimedAdmin := (AdminID == userIDStr)
	mu.RUnlock()

	// If not admin, require valid invite code
	if !isHardcodedAdmin && !isClaimedAdmin {
		if req.InviteCode == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Invite code required"})
			return
		}

		// Validate invite code
		mu.RLock()
		validInvite := InviteCodes[req.InviteCode]
		mu.RUnlock()

		if !validInvite {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid invite code"})
			return
		}
	}

	qrMutex.Lock()
	session.UserID = userIDStr
	session.Status = "authenticated"
	qrMutex.Unlock()

	// Return user info with admin status
	c.JSON(http.StatusOK, gin.H{
		"status":  "success",
		"isOwner": isHardcodedAdmin || isClaimedAdmin,
		"name":    user.FirstName,
	})
}
