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
	`
	db.MustExec(schema)

	return db, nil
}
