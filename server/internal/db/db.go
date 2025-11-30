package db

import (
	"github.com/jmoiron/sqlx"
	_ "modernc.org/sqlite"
)

func InitDB(dataSourceName string) (*sqlx.DB, error) {
	db, err := sqlx.Connect("sqlite", dataSourceName)
	if err != nil {
		return nil, err
	}

	schema := `
	CREATE TABLE IF NOT EXISTS users (
		id TEXT PRIMARY KEY,
		created_at INTEGER
	);
	CREATE TABLE IF NOT EXISTS game_state (
		user_id TEXT PRIMARY KEY,
		x REAL,
		y REAL,
		updated_at INTEGER,
		FOREIGN KEY(user_id) REFERENCES users(id)
	);
	CREATE TABLE IF NOT EXISTS invites (
		code TEXT PRIMARY KEY,
		is_used BOOLEAN DEFAULT 0
	);
	CREATE TABLE IF NOT EXISTS objects (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		x REAL,
		y REAL,
		type TEXT
	);
	`
	db.MustExec(schema)

	// Seed default data
	db.Exec("INSERT OR IGNORE INTO invites (code) VALUES ('TOM2025')")
	db.Exec("INSERT OR IGNORE INTO objects (x, y, type) VALUES (100, 100, 'tree'), (200, 150, 'rock'), (300, 50, 'tree')")

	return db, nil
}
