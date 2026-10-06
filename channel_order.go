package main

import (
	"errors"
	"fmt"
	"strconv"
	"strings"

	"gorm.io/gorm"
)

const rankDigits = "0123456789abcdef"
const rankStep uint64 = 1 << 32

// Ranks use SQLite's binary string ordering, never floating point. The initial
// 16-digit integer space makes appends compact. Between close neighbors we
// extend the fractional suffix, so repeated insertions never exhaust a gap.
// Empty bounds mean the beginning/end of the list, respectively.
func rankBetween(lower, upper string) (string, error) {
	if upper != "" && lower >= upper {
		return "", errors.New("invalid rank bounds")
	}
	if upper == "" {
		if lower == "" {
			return fmt.Sprintf("%016x", rankStep), nil
		}
		if len(lower) >= 16 {
			n, err := strconv.ParseUint(lower[:16], 16, 64)
			if err == nil && n <= ^uint64(0)-rankStep {
				return fmt.Sprintf("%016x", n+rankStep), nil
			}
		}
	}
	var prefix strings.Builder
	for i := 0; ; i++ {
		a, b := 0, 15
		if i < len(lower) {
			a = strings.IndexByte(rankDigits, lower[i])
		}
		if upper != "" {
			if i >= len(upper) {
				return "", errors.New("invalid upper rank")
			}
			b = strings.IndexByte(rankDigits, upper[i])
		}
		if a < 0 || b < 0 {
			return "", errors.New("invalid rank")
		}
		if b-a > 1 {
			prefix.WriteByte(rankDigits[(a+b)/2])
			return prefix.String(), nil
		}
		prefix.WriteByte(rankDigits[a])
		if a < b {
			upper = ""
		}
	}
}

func appendChannel(tx *gorm.DB, channel *Channel) error {
	var last Channel
	err := tx.Order("rank DESC").First(&last).Error
	if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		return err
	}
	channel.Rank, err = rankBetween(last.Rank, "")
	if err != nil {
		return err
	}
	return tx.Create(channel).Error
}

// Only unranked legacy rows are touched. Restarting keeps all saved positions.
func migrateChannelRanks(db *gorm.DB) error {
	return db.Transaction(func(tx *gorm.DB) error {
		var legacy []Channel
		if err := tx.Where("rank IS NULL OR rank = ''").Order("created_at, id").Find(&legacy).Error; err != nil {
			return err
		}
		if len(legacy) == 0 {
			return nil
		}
		var last Channel
		err := tx.Where("rank IS NOT NULL AND rank <> ''").Order("rank DESC").First(&last).Error
		if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
			return err
		}
		for _, channel := range legacy {
			rank, err := rankBetween(last.Rank, "")
			if err != nil {
				return err
			}
			if err := tx.Model(&Channel{}).Where("id = ?", channel.ID).Update("rank", rank).Error; err != nil {
				return err
			}
			last.Rank = rank
		}
		return nil
	})
}

// The client sends a destination ID, not ranks or a reordered array. Resolve
// its current predecessor inside an IMMEDIATE SQLite transaction, which also
// serializes competing moves/creates across connections and server processes.
func moveChannel(db *gorm.DB, channelID, beforeID string) (*Channel, error) {
	if channelID == "" || channelID == beforeID {
		return nil, errors.New("invalid channel destination")
	}
	var channel Channel
	err := db.Transaction(func(tx *gorm.DB) error {
		if err := tx.First(&channel, "id = ?", channelID).Error; err != nil {
			return errors.New("channel no longer exists")
		}
		upper := ""
		if beforeID != "" {
			var target Channel
			if err := tx.First(&target, "id = ?", beforeID).Error; err != nil {
				return errors.New("destination no longer exists; try again")
			}
			upper = target.Rank
		}
		var previous Channel
		query := tx.Where("id <> ?", channelID)
		if upper != "" {
			query = query.Where("rank < ?", upper)
		}
		err := query.Order("rank DESC").First(&previous).Error
		if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
			return err
		}
		if channel.Rank > previous.Rank && (upper == "" || channel.Rank < upper) {
			return nil
		}
		channel.Rank, err = rankBetween(previous.Rank, upper)
		if err != nil {
			return err
		}
		return tx.Model(&channel).Update("rank", channel.Rank).Error
	})
	return &channel, err
}
