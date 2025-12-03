package main

import (
	"crypto/rand"
	"fmt"
	"log"
	"math/big"
	"net/http"
	"strconv"
	"tom-server/internal/auth"
	"tom-server/internal/db"
	"tom-server/internal/game"

	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
)

func main() {
	// Load .env
	godotenv.Load()

	// Initialize Database
	database, err := db.InitDB("tom.db")
	if err != nil {
		log.Fatal("Failed to connect to database:", err)
	}
	defer database.Close()

	// Initialize Game Hub
	hub := game.NewHub(database)
	go hub.Run()

	// Prompt for Admin ID
	fmt.Println("\n================================================")
	fmt.Println("   Tom Metaverse Server Setup")
	fmt.Println("================================================")
	fmt.Print("Enter your Telegram User ID (get from @userinfobot): ")

	var adminIDInput string
	fmt.Scanln(&adminIDInput)

	// Parse and store admin ID
	adminIDInt, err := strconv.ParseInt(adminIDInput, 10, 64)
	if err != nil || adminIDInt == 0 {
		log.Println("⚠️  Invalid admin ID, using default. Server will require invite codes for all users.")
		auth.HardcodedAdminID = 0
	} else {
		auth.HardcodedAdminID = adminIDInt
		log.Printf("✅ Admin ID set to: %d\n", adminIDInt)
	}

	// Generate Admin Code
	n, _ := rand.Int(rand.Reader, big.NewInt(1000000))
	auth.AdminCode = fmt.Sprintf("%06d", n.Int64())

	log.Println("================================================")
	log.Println("   WORLD ADMIN CODE: " + auth.AdminCode)
	log.Println("================================================")

	r := gin.Default()

	// CORS
	r.Use(func(c *gin.Context) {
		c.Writer.Header().Set("Access-Control-Allow-Origin", "*")
		c.Writer.Header().Set("Access-Control-Allow-Credentials", "true")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization, accept, origin, Cache-Control, X-Requested-With")
		c.Writer.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS, GET, PUT")

		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}
		c.Next()
	})

	// Routes
	api := r.Group("/api")
	{
		api.GET("/health", func(c *gin.Context) {
			c.String(http.StatusOK, "Server is running!")
		})

		// Auth
		api.POST("/auth/init", auth.InitSession)
		api.POST("/auth/verify", auth.VerifySession)
		api.POST("/auth/invite", auth.ValidateInvite(database))
		api.POST("/auth/qr/init", auth.InitQR)
		api.GET("/auth/qr/poll", auth.PollQR)
		api.POST("/auth/qr/scan", auth.ScanQR)
		api.POST("/auth/tma", auth.ValidateTMA)

		// Admin & Decentralized Flow
		api.POST("/admin/claim", auth.ClaimAdmin)
		api.POST("/admin/invite", auth.GenerateInvite)
		api.POST("/auth/check-invite", auth.ValidateInviteCode)

		// World
		api.GET("/world/objects", func(c *gin.Context) {
			var objects []struct {
				ID   int     `json:"id" db:"id"`
				X    float64 `json:"x" db:"x"`
				Y    float64 `json:"y" db:"y"`
				Type string  `json:"type" db:"type"`
			}
			err := database.Select(&objects, "SELECT * FROM objects")
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch objects"})
				return
			}
			c.JSON(http.StatusOK, objects)
		})

		// Game WebSocket
		api.GET("/ws/game", func(c *gin.Context) {
			game.ServeWs(hub, c.Writer, c.Request)
		})
	}

	log.Println("Server starting on port 8080")
	r.Run(":8080")
}
