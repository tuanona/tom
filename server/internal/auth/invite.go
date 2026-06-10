package auth

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/jmoiron/sqlx"
)

func ValidateInvite(db *sqlx.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req struct {
			Code string `json:"code"`
		}
		if err := c.BindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request"})
			return
		}

		var exists int
		err := db.Get(&exists, "SELECT 1 FROM invites WHERE code = ?", req.Code)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid invite code"})
			return
		}

		c.JSON(http.StatusOK, gin.H{"status": "valid", "token": "temp_token_for_" + req.Code})
	}
}

func codeIsValid(db *sqlx.DB, code string) bool {
	mu.RLock()
	ok := InviteCodes[code]
	mu.RUnlock()
	if ok {
		return true
	}
	var exists int
	return db.Get(&exists, "SELECT 1 FROM invites WHERE code = ?", code) == nil
}

// InviteLogin lets anyone the owner invited join straight from the web
// client with a pseudonym — no Telegram required. This is what makes a
// self-hosted instance (even on a LAN) joinable by guests.
func InviteLogin(db *sqlx.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req struct {
			Code string `json:"code"`
			Name string `json:"name"`
		}
		if err := c.BindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request"})
			return
		}

		name := strings.TrimSpace(req.Name)
		if name == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Name is required"})
			return
		}
		if len(name) > 24 {
			name = name[:24]
		}

		if !codeIsValid(db, strings.TrimSpace(req.Code)) {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid invite code"})
			return
		}

		userID := "inv_" + randomHex(4)
		token := CreateSession(userID, name)
		c.JSON(http.StatusOK, gin.H{
			"status": "authenticated",
			"token":  token,
			"userId": userID,
			"name":   name,
		})
	}
}
