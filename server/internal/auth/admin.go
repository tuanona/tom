package auth

import (
	"crypto/rand"
	"encoding/hex"
	"net/http"
	"sync"

	"github.com/gin-gonic/gin"
)

// In-Memory State for Decentralized Server
var (
	AdminID          string
	AdminCode        string // Set on startup
	HardcodedAdminID int64  // Set via user input on startup
	InviteCodes      = make(map[string]bool)
	mu               sync.RWMutex
)

// ClaimAdmin attempts to claim this server.
// Returns success if no admin exists, or if the requester is already the admin.
func ClaimAdmin(c *gin.Context) {
	var req struct {
		UserID string `json:"user_id"`
		Code   string `json:"code"`
	}
	if err := c.BindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request"})
		return
	}

	mu.Lock()
	defer mu.Unlock()

	// If already admin, just return success (idempotent)
	if AdminID == req.UserID {
		c.JSON(http.StatusOK, gin.H{"success": true, "message": "Welcome back, Admin."})
		return
	}

	// If admin exists and it's not you
	if AdminID != "" {
		c.JSON(http.StatusForbidden, gin.H{"error": "Server already has an admin."})
		return
	}

	// Verify Code
	if req.Code != AdminCode {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid Admin Code"})
		return
	}

	// Success
	AdminID = req.UserID
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "You are now the Admin!"})
}

// GenerateInvite creates a new invite code. Only Admin can do this.
func GenerateInvite(c *gin.Context) {
	var req struct {
		UserID string `json:"user_id"`
	}
	if err := c.BindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request"})
		return
	}

	mu.RLock()
	isAdmin := (AdminID == req.UserID)
	mu.RUnlock()

	if !isAdmin {
		c.JSON(http.StatusForbidden, gin.H{"error": "Only Admin can generate invites."})
		return
	}

	// Generate random code
	bytes := make([]byte, 4)
	if _, err := rand.Read(bytes); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate code"})
		return
	}
	code := hex.EncodeToString(bytes)

	mu.Lock()
	InviteCodes[code] = true
	mu.Unlock()

	c.JSON(http.StatusOK, gin.H{"code": code})
}

// ValidateInvite checks if an invite code is valid.
func ValidateInviteCode(c *gin.Context) {
	var req struct {
		Code string `json:"code"`
	}
	if err := c.BindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request"})
		return
	}

	mu.RLock()
	valid := InviteCodes[req.Code]
	mu.RUnlock()

	if valid {
		c.JSON(http.StatusOK, gin.H{"valid": true})
	} else {
		c.JSON(http.StatusUnauthorized, gin.H{"valid": false, "error": "Invalid Invite Code"})
	}
}
