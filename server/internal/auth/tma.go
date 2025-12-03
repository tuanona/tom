package auth

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"sort"
	"strings"

	"github.com/gin-gonic/gin"
)

// ValidateTMA validates the initData string from Telegram Mini Apps
func ValidateTMA(c *gin.Context) {
	var req struct {
		InitData string `json:"initData"`
	}

	if err := c.BindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request"})
		return
	}

	botToken := os.Getenv("BOT_TOKEN")
	if botToken == "" {
		// Fallback for development if token not set
		c.JSON(http.StatusOK, gin.H{
			"status": "authenticated",
			"token":  "dev_token_tma",
			"userId": "dev_user_tma",
		})
		return
	}

	if isValid := validateWebAppData(req.InitData, botToken); !isValid {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid TMA data"})
		return
	}

	// Parse user data from initData
	parsedData, _ := url.ParseQuery(req.InitData)
	userJSON := parsedData.Get("user")
	var user struct {
		ID        int64  `json:"id"`
		FirstName string `json:"first_name"`
		Username  string `json:"username"`
	}
	json.Unmarshal([]byte(userJSON), &user)

	// In a real app, you would create/fetch the user in the DB here
	userID := fmt.Sprintf("user_%d", user.ID)

	c.JSON(http.StatusOK, gin.H{
		"status": "authenticated",
		"token":  "tma_token_" + userID,
		"userId": userID,
	})
}

// validateWebAppData validates the data received from the Telegram Web App
// Source: https://core.telegram.org/bots/webapps#validating-data-received-via-the-web-app
func validateWebAppData(initData, token string) bool {
	q, err := url.ParseQuery(initData)
	if err != nil {
		return false
	}

	hash := q.Get("hash")
	q.Del("hash")

	var keys []string
	for k := range q {
		keys = append(keys, k)
	}
	sort.Strings(keys)

	var dataCheckString strings.Builder
	for i, k := range keys {
		if i > 0 {
			dataCheckString.WriteString("\n")
		}
		dataCheckString.WriteString(fmt.Sprintf("%s=%s", k, q.Get(k)))
	}

	secretKey := hmac.New(sha256.New, []byte("WebAppData"))
	secretKey.Write([]byte(token))
	secret := secretKey.Sum(nil)

	h := hmac.New(sha256.New, secret)
	h.Write([]byte(dataCheckString.String()))
	calculatedHash := hex.EncodeToString(h.Sum(nil))

	return calculatedHash == hash
}
