package main

import (
	"errors"

	"github.com/google/uuid"
	"github.com/recodeorg/tether"
	"gorm.io/gorm"
)

func privateChannel(db *gorm.DB, params map[string]any) (*Channel, error) {
	id, ok := params["channelID"].(string)
	if !ok || id == "" {
		return nil, errors.New("channelID is required")
	}
	var channel Channel
	if err := db.Where("id = ?", id).First(&channel).Error; err != nil {
		return nil, errors.New("channel not found")
	}
	if !channel.IsPrivate {
		return nil, errors.New("invitations are only available for private channels")
	}
	return &channel, nil
}

func registerChannelInvitations(engine *tether.Engine) {
	engine.RegisterQuery("getChannelInvitees", getChannelInvitees)
	engine.RegisterMutation("inviteToChannel", inviteToChannel)
}

func getChannelInvitees(ctx *tether.QueryCtx) (any, error) {
	admin, err := ctx.Auth.ExecuteGuard("isAdmin", map[string]any{})
	if err != nil || admin != true {
		return nil, errors.New("unauthorized")
	}
	channel, err := privateChannel(ctx.DB, ctx.Params)
	if err != nil {
		return nil, err
	}
	ctx.TrackTable("users")
	ctx.TrackCollection("channel_members", "channel_id", channel.ID)
	// Return only the fields needed to identify an invitee.
	users := []struct{ ID, Username, Nickname string }{}
	err = ctx.DB.Model(&User{}).Select("id, username, nickname").
		Where("role <> ?", "admin").
		Where("id NOT IN (?)", ctx.DB.Model(&ChannelMember{}).Select("user_id").Where("channel_id = ?", channel.ID)).
		Order("username, id").Find(&users).Error
	return users, err
}

func inviteToChannel(ctx *tether.MutationCtx) (any, error) {
	admin, err := ctx.Auth.ExecuteGuard("isAdmin", map[string]any{})
	if err != nil || admin != true {
		return nil, errors.New("unauthorized")
	}
	userID, ok := ctx.Params["userID"].(string)
	if !ok || userID == "" {
		return nil, errors.New("userID is required")
	}
	err = ctx.DB.Transaction(func(tx *gorm.DB) error {
		channel, err := privateChannel(tx, ctx.Params)
		if err != nil {
			return err
		}
		var user User
		if err := tx.Where("id = ?", userID).First(&user).Error; err != nil {
			return errors.New("user not found")
		}
		if user.Role == "admin" {
			return nil // Admins already have access.
		}
		var member ChannelMember
		// The SQLite write transaction serializes invitations, including retries.
		return tx.Where("channel_id = ? AND user_id = ?", channel.ID, userID).Attrs(ChannelMember{ID: uuid.New().String(), ChannelID: channel.ID, UserID: userID}).FirstOrCreate(&member).Error
	})
	if err != nil {
		return nil, err
	}
	return map[string]any{"success": true}, nil
}
