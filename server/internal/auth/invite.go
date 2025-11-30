package auth

import (
	"net/http"

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
