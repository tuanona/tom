package main

import (
	"log"
	"net/http"
	"tom-server/internal/auth"
	"tom-server/internal/db"
	"tom-server/internal/game"

	"github.com/gin-gonic/gin"
)

func main() {
	// Initialize Database
	database, err := db.InitDB("tom.db")
	if err != nil {
		log.Fatal("Failed to connect to database:", err)
	}
	defer database.Close()

	// Initialize Game Hub
	hub := game.NewHub(database)
	go hub.Run()

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
