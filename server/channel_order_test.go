package main

import (
	"fmt"
	"math/rand"
	"path/filepath"
	"slices"
	"sync"
	"testing"
	"time"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

func TestRankBetween(t *testing.T) {
	ranks := []string{}
	rng := rand.New(rand.NewSource(42))
	for i := 0; i < 10000; i++ {
		position := rng.Intn(len(ranks) + 1)
		lower, upper := "", ""
		if position > 0 {
			lower = ranks[position-1]
		}
		if position < len(ranks) {
			upper = ranks[position]
		}
		rank, err := rankBetween(lower, upper)
		if err != nil || rank <= lower || (upper != "" && rank >= upper) {
			t.Fatalf("between %q and %q: %q, %v", lower, upper, rank, err)
		}
		ranks = slices.Insert(ranks, position, rank)
	}
	// Repeatedly insert into the same tiny gap, beyond float/integer precision.
	for _, head := range []bool{false, true} {
		lower, upper := "0000000100000000", "0000000100000001"
		if head {
			lower = ""
		}
		for i := 0; i < 1000; i++ {
			rank, err := rankBetween(lower, upper)
			if err != nil || rank <= lower || rank >= upper {
				t.Fatalf("dense insert: %q %q %q %v", lower, rank, upper, err)
			}
			upper = rank
		}
	}
	lower := ""
	for i := 0; i < 10000; i++ {
		rank, err := rankBetween(lower, "")
		if err != nil || rank <= lower || len(rank) != 16 {
			t.Fatalf("append %q: %v", rank, err)
		}
		lower = rank
	}
	if _, err := rankBetween("b", "a"); err == nil {
		t.Fatal("accepted reversed bounds")
	}
}

func orderDB(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(filepath.Join(t.TempDir(), "order.db")+"?_txlock=immediate&_busy_timeout=5000"), &gorm.Config{Logger: logger.Default.LogMode(logger.Silent)})
	if err != nil {
		t.Fatal(err)
	}
	sql, _ := db.DB()
	t.Cleanup(func() { sql.Close() })
	if err := db.AutoMigrate(&Channel{}); err != nil {
		t.Fatal(err)
	}
	return db
}
func addChannels(t *testing.T, db *gorm.DB, ids ...string) {
	t.Helper()
	for _, id := range ids {
		if err := db.Transaction(func(tx *gorm.DB) error { return appendChannel(tx, &Channel{ID: id, Name: id}) }); err != nil {
			t.Fatal(err)
		}
	}
}
func assertOrder(t *testing.T, db *gorm.DB, want ...string) {
	t.Helper()
	var rows []Channel
	if err := db.Order("rank, id").Find(&rows).Error; err != nil {
		t.Fatal(err)
	}
	ids := []string{}
	for i, row := range rows {
		if row.Rank == "" || (i > 0 && rows[i-1].Rank >= row.Rank) {
			t.Fatal("missing/duplicate/out-of-order rank")
		}
		ids = append(ids, row.ID)
	}
	if !slices.Equal(ids, want) {
		t.Fatalf("got %v want %v", ids, want)
	}
}
func TestMoveChannel(t *testing.T) {
	db := orderDB(t)
	addChannels(t, db, "a", "b", "c", "d")
	var original []Channel
	db.Order("rank").Find(&original)
	if _, err := moveChannel(db, "d", "b"); err != nil {
		t.Fatal(err)
	}
	assertOrder(t, db, "a", "d", "b", "c")
	for _, before := range original[:3] {
		var after Channel
		db.First(&after, "id = ?", before.ID)
		if after.Rank != before.Rank || !after.UpdatedAt.Equal(before.UpdatedAt) {
			t.Fatal("move changed another channel")
		}
	}
	if _, err := moveChannel(db, "c", "a"); err != nil {
		t.Fatal(err)
	}
	assertOrder(t, db, "c", "a", "d", "b")
	if _, err := moveChannel(db, "c", ""); err != nil {
		t.Fatal(err)
	}
	assertOrder(t, db, "a", "d", "b", "c")
	addChannels(t, db, "e")
	assertOrder(t, db, "a", "d", "b", "c", "e")
	for _, pair := range [][2]string{{"a", "a"}, {"a", "missing"}, {"missing", "b"}, {"", "b"}} {
		if _, err := moveChannel(db, pair[0], pair[1]); err == nil {
			t.Fatal("accepted invalid move", pair)
		}
	}
	assertOrder(t, db, "a", "d", "b", "c", "e")
}
func TestMigrateChannelRanks(t *testing.T) {
	db := orderDB(t)
	// Simulate the previous schema, then exercise the actual upgrade.
	if err := db.Migrator().DropTable(&Channel{}); err != nil {
		t.Fatal(err)
	}
	if err := db.Exec("CREATE TABLE channels (id TEXT PRIMARY KEY, name TEXT, is_private NUMERIC, created_at DATETIME, updated_at DATETIME)").Error; err != nil {
		t.Fatal(err)
	}
	for i, id := range []string{"b", "a", "c"} {
		if err := db.Exec("INSERT INTO channels (id, name, created_at) VALUES (?, ?, ?)", id, id, time.Unix(int64(i), 0)).Error; err != nil {
			t.Fatal(err)
		}
	}
	if err := db.AutoMigrate(&Channel{}); err != nil {
		t.Fatal(err)
	}
	if err := migrateChannelRanks(db); err != nil {
		t.Fatal(err)
	}
	assertOrder(t, db, "b", "a", "c")
	if _, err := moveChannel(db, "c", "b"); err != nil {
		t.Fatal(err)
	}
	if err := migrateChannelRanks(db); err != nil {
		t.Fatal(err)
	}
	assertOrder(t, db, "c", "b", "a")
}
func TestConcurrentChannelMovesAndCreates(t *testing.T) {
	db := orderDB(t)
	addChannels(t, db, "a", "b", "c", "d")
	var wg sync.WaitGroup
	for i := 0; i < 24; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			var err error
			if i%2 == 0 {
				err = db.Transaction(func(tx *gorm.DB) error { return appendChannel(tx, &Channel{ID: fmt.Sprintf("new-%d", i)}) })
			} else {
				_, err = moveChannel(db, []string{"a", "b", "c"}[i%3], "d")
			}
			if err != nil {
				t.Errorf("concurrent operation: %v", err)
			}
		}(i)
	}
	wg.Wait()
	var rows []Channel
	db.Order("rank").Find(&rows)
	if len(rows) != 16 {
		t.Fatal("lost channel")
	}
	for i := 1; i < len(rows); i++ {
		if rows[i-1].Rank >= rows[i].Rank {
			t.Fatal("rank collision")
		}
	}
}
