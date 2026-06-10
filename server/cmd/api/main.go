package main

import (
	"crypto/rand"
	"fmt"
	"log"
	"math/big"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"tom-server/internal/auth"
	"tom-server/internal/db"
	"tom-server/internal/game"
	"tom-server/internal/world"

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

	// Sessions (real tokens for QR/TMA logins)
	if err := auth.InitSessionStore(database); err != nil {
		log.Fatal("Failed to init session store:", err)
	}
	auth.DevMode = os.Getenv("BOT_TOKEN") == ""
	if auth.DevMode {
		log.Println("⚠️  DEV MODE: BOT_TOKEN not set — guests may join the world without Telegram auth.")
	}

	// World: load persisted island or generate the first one
	w, err := world.Load(database)
	if err != nil {
		log.Fatal("Failed to load world:", err)
	}
	if w == nil {
		log.Println("🌱 No world found — generating the floating island...")
		w = world.GenerateIsland()
		if err := w.SaveIfDirty(database); err != nil {
			log.Fatal("Failed to save generated world:", err)
		}
	}
	log.Printf("🏝️  World ready: %dx%dx%d voxels\n", w.W, w.H, w.D)

	// Initialize Game Hub
	hub := game.NewHub(database, w)
	go hub.Run()

	// Admin ID: env first (ADMIN_TELEGRAM_ID), interactive prompt as fallback
	adminEnv := os.Getenv("ADMIN_TELEGRAM_ID")
	if adminEnv == "" {
		fmt.Println("\n================================================")
		fmt.Println("   Tom Metaverse Server Setup")
		fmt.Println("================================================")
		fmt.Print("Enter your Telegram User ID (get from @userinfobot, or set ADMIN_TELEGRAM_ID): ")
		fmt.Scanln(&adminEnv)
	}
	adminIDInt, err := strconv.ParseInt(adminEnv, 10, 64)
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
		api.POST("/auth/invite-login", auth.InviteLogin(database))
		api.POST("/auth/qr/init", auth.InitQR)
		api.GET("/auth/qr/poll", auth.PollQR)
		api.POST("/auth/qr/scan", auth.ScanQR)
		api.POST("/auth/tma", auth.ValidateTMA)
		api.GET("/auth/me", auth.Me)

		// Admin & Decentralized Flow
		api.POST("/admin/claim", auth.ClaimAdmin)
		api.POST("/admin/invite", auth.GenerateInvite)
		api.POST("/auth/check-invite", auth.ValidateInviteCode)

		// Game WebSocket
		api.GET("/ws/game", func(c *gin.Context) {
			game.ServeWs(hub, c.Writer, c.Request)
		})
	}

	// TonConnect manifest, built per-request so wallets can verify the app
	// no matter which URL this instance runs behind.
	r.GET("/tonconnect-manifest.json", func(c *gin.Context) {
		base := auth.RequestBaseURL(c)
		c.JSON(http.StatusOK, gin.H{
			"url":     base,
			"name":    "Tom's World",
			"iconUrl": base + "/vite.svg",
		})
	})

	// Serve the built web client when available: one shared URL is all an
	// owner needs to hand out for friends to join their instance.
	if dist := findClientDist(); dist != "" {
		log.Printf("🕹️  Serving web client from %s\n", dist)
		r.NoRoute(func(c *gin.Context) {
			if strings.HasPrefix(c.Request.URL.Path, "/api/") {
				c.JSON(http.StatusNotFound, gin.H{"error": "Not found"})
				return
			}
			p := filepath.Join(dist, filepath.Clean("/"+c.Request.URL.Path))
			if st, err := os.Stat(p); err == nil && !st.IsDir() {
				c.File(p)
				return
			}
			c.File(filepath.Join(dist, "index.html"))
		})
	} else {
		log.Println("ℹ️  client/dist not found — API only (run `bun run build` in client/, or set CLIENT_DIST)")
	}

	log.Println("Server starting on port 8080")
	r.Run(":8080")
}

func findClientDist() string {
	if env := os.Getenv("CLIENT_DIST"); env != "" {
		return env
	}
	for _, p := range []string{"../client/dist", "./client/dist", "client/dist"} {
		if st, err := os.Stat(filepath.Join(p, "index.html")); err == nil && !st.IsDir() {
			abs, err := filepath.Abs(p)
			if err == nil {
				return abs
			}
			return p
		}
	}
	return ""
}
