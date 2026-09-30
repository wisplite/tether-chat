package main

import (
	"context"
	"errors"
	"fmt"
	"time"

	"net/http"

	"github.com/google/uuid"
	"github.com/recodeorg/tether"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

type User struct {
	ID         string `gorm:"primaryKey"`
	Username   string `gorm:"unique"`
	Nickname   string
	Password   string
	AvatarUrl  string
	Role       string
	Status     string
	Presence   string
	LastActive time.Time
	CreatedAt  time.Time
	UpdatedAt  time.Time
}

type Token struct {
	ID        string `gorm:"primaryKey"`
	UserID    string `gorm:"index"`
	Token     string
	CreatedAt time.Time
	UpdatedAt time.Time
}

type Channel struct {
	ID        string `gorm:"primaryKey"`
	Name      string
	IsPrivate bool
	CreatedAt time.Time
	UpdatedAt time.Time
}

type ChannelMember struct {
	ID        string `gorm:"primaryKey"`
	ChannelID string `gorm:"index"`
	UserID    string `gorm:"index"`
	CreatedAt time.Time
	UpdatedAt time.Time
}

type Message struct {
	ID        string `gorm:"primaryKey"`
	ChannelID string `tether:"track" gorm:"index"`
	UserID    string `gorm:"index"`
	Content   string
	CreatedAt time.Time
	UpdatedAt time.Time
}

type Auth struct{}

func (a *Auth) VerifyToken(ctx context.Context, db *gorm.DB, token string) (string, time.Time, error) {
	tokenModel := &Token{}
	if err := db.Where("token = ?", token).First(tokenModel).Error; err != nil {
		return "", time.Time{}, errors.New("invalid token")
	}
	return tokenModel.UserID, tokenModel.CreatedAt.Add(time.Hour * 24), nil
}

func main() {
	db, err := gorm.Open(sqlite.Open("tether.db"), &gorm.Config{})
	if err != nil {
		panic("failed to connect database")
	}
	engine, err := tether.NewEngine(db)
	if err != nil {
		panic("failed to create engine")
	}

	engine.SetAuth(&Auth{})

	engine.CreateTable(&User{})
	engine.CreateTable(&Token{})
	engine.CreateTable(&Channel{})
	engine.CreateTable(&ChannelMember{})
	engine.CreateTable(&Message{})

	engine.SetCheckOrigin(func(r *http.Request) bool {
		return true
	})

	engine.RegisterGuard("isAdmin", func(ctx *tether.GuardCtx) (any, error) {
		userID, err := ctx.Auth.GetIdentity()
		if err != nil {
			return false, nil
		}
		ctx.TrackCollection("users", "id", userID)
		user := &User{}
		if err := ctx.DB.Where("id = ?", userID).First(user).Error; err != nil {
			return false, nil
		}
		if user.Role != "admin" {
			return false, nil
		}
		return true, nil
	})

	engine.RegisterGuard("permittedChannels", func(ctx *tether.GuardCtx) (any, error) {
		userID, err := ctx.Auth.GetIdentity()
		if err != nil {
			return []string{}, nil
		}
		if userID == "" {
			return []string{}, nil
		}
		channelIDs := []string{}
		ctx.TrackTable("channels")
		ctx.TrackCollection("channel_members", "user_id", userID)
		channelMembers := []ChannelMember{}
		if err := ctx.DB.Where("user_id = ?", userID).Find(&channelMembers).Error; err != nil {
			return []string{}, nil
		}
		for _, channelMember := range channelMembers {
			channelIDs = append(channelIDs, channelMember.ChannelID)
		}
		publicChannels := []Channel{}
		if err := ctx.DB.Where("is_private = ?", false).Find(&publicChannels).Error; err != nil {
			return []string{}, nil
		}
		for _, publicChannel := range publicChannels {
			channelIDs = append(channelIDs, publicChannel.ID)
		}
		return channelIDs, nil
	})

	engine.RegisterGuard("isChannelMember", func(ctx *tether.GuardCtx) (any, error) {
		userID, err := ctx.Auth.GetIdentity()
		if err != nil {
			return false, nil
		}
		if userID == "" {
			return false, nil
		}
		channelID, ok := ctx.Params["channelID"].(string)
		if !ok {
			return false, nil
		}
		channel := &Channel{}
		if err := ctx.DB.Where("id = ?", channelID).First(channel).Error; err != nil {
			return false, nil
		}
		if err != nil {
			return false, nil
		}
		if channel.ID == "" {
			return false, nil
		}
		if channel.IsPrivate {
			return true, nil
		}
		ctx.TrackCollection("channel_members", "user_id", userID)
		channelMember := &ChannelMember{}
		if err := ctx.DB.Where("user_id = ? AND channel_id = ?", userID, channelID).First(channelMember).Error; err != nil {
			return false, nil
		}
		if channelMember.ID == "" {
			return false, nil
		}
		return true, nil
	})

	engine.RegisterMutation("createAccount", func(ctx *tether.MutationCtx) (any, error) {
		username, ok := ctx.Params["username"].(string)
		if !ok {
			return nil, errors.New("username is required")
		}
		password, ok := ctx.Params["password"].(string)
		if !ok {
			return nil, errors.New("password is required")
		}
		hashedPassword, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
		if err != nil {
			return nil, errors.New("failed to hash password")
		}
		user := &User{
			ID:       uuid.New().String(),
			Username: username,
			Password: string(hashedPassword),
		}
		if err := ctx.DB.Create(user).Error; err != nil {
			return nil, errors.New("failed to create user")
		}
		return map[string]any{
			"user": user,
		}, nil
	})

	engine.RegisterMutation("login", func(ctx *tether.MutationCtx) (any, error) {
		username, ok := ctx.Params["username"].(string)
		if !ok {
			return nil, errors.New("username is required")
		}
		password, ok := ctx.Params["password"].(string)
		if !ok {
			return nil, errors.New("password is required")
		}
		user := &User{}
		if err := ctx.DB.Where("username = ?", username).First(user).Error; err != nil {
			return nil, errors.New("user not found")
		}
		if err := bcrypt.CompareHashAndPassword([]byte(user.Password), []byte(password)); err != nil {
			return nil, errors.New("invalid password")
		}
		token := &Token{
			ID:     uuid.New().String(),
			UserID: user.ID,
			Token:  uuid.New().String(),
		}
		if err := ctx.DB.Create(token).Error; err != nil {
			return nil, errors.New("failed to create token")
		}
		return map[string]any{
			"token": token.Token,
		}, nil
	})

	engine.RegisterMutation("createChannel", func(ctx *tether.MutationCtx) (any, error) {
		isAdmin, err := ctx.Auth.ExecuteGuard("isAdmin", map[string]any{})
		if err != nil {
			return nil, errors.New("unauthorized")
		}
		isAdminBool, ok := isAdmin.(bool)
		if !ok {
			return nil, errors.New("unauthorized")
		}
		if !isAdminBool {
			return nil, errors.New("unauthorized")
		}
		name, ok := ctx.Params["name"].(string)
		if !ok {
			return nil, errors.New("name is required")
		}
		isPrivate, ok := ctx.Params["isPrivate"].(bool)
		if !ok {
			return nil, errors.New("isPrivate is required")
		}
		channel := &Channel{
			ID:        uuid.New().String(),
			Name:      name,
			IsPrivate: isPrivate,
		}
		if err := ctx.DB.Create(channel).Error; err != nil {
			return nil, errors.New("failed to create channel")
		}
		return map[string]any{
			"channel": map[string]any{
				"id":        channel.ID,
				"name":      channel.Name,
				"isPrivate": channel.IsPrivate,
			},
		}, nil
	})

	engine.RegisterQuery("getChannels", func(ctx *tether.QueryCtx) (any, error) {
		permittedChannels, err := ctx.Auth.ExecuteGuard("permittedChannels", map[string]any{})
		fmt.Println(permittedChannels)
		if err != nil {
			return nil, errors.New("unauthorized")
		}
		raw, ok := permittedChannels.([]any)
		if !ok {
			fmt.Println("unauthorized")
			return nil, errors.New("unauthorized")
		}
		ids := make([]string, 0, len(raw))
		for _, id := range raw {
			idString, ok := id.(string)
			if !ok {
				fmt.Println("unauthorized")
				return nil, errors.New("unauthorized")
			}
			ids = append(ids, idString)
		}
		ctx.TrackTable("channels")
		channels := []Channel{}
		if err := ctx.DB.Where("id IN (?)", ids).Find(&channels).Error; err != nil {
			return nil, errors.New("failed to get channels")
		}
		fmt.Println(channels)
		return channels, nil
	})

	engine.RegisterQuery("getMessages", func(ctx *tether.QueryCtx) (any, error) {
		channelID, ok := ctx.Params["channelID"].(string)
		if !ok {
			return nil, errors.New("channelID is required")
		}
		isChannelMember, err := ctx.Auth.ExecuteGuard("isChannelMember", map[string]any{
			"channelID": channelID,
		})
		if err != nil {
			return nil, errors.New("unauthorized")
		}
		isChannelMemberBool, ok := isChannelMember.(bool)
		if !ok {
			return nil, errors.New("unauthorized")
		}
		if !isChannelMemberBool {
			return nil, errors.New("unauthorized")
		}
		ctx.TrackCollection("messages", "channel_id", channelID)
		messages := []Message{}
		if err := ctx.DB.Where("channel_id = ?", channelID).Find(&messages).Error; err != nil {
			return nil, errors.New("failed to get messages")
		}
		return messages, nil
	})

	engine.RegisterQuery("getUserInfo", func(ctx *tether.QueryCtx) (any, error) {
		userID, err := ctx.Auth.GetIdentity()
		if err != nil {
			return nil, errors.New("unauthorized")
		}
		user := &User{}
		if err := ctx.DB.Where("id = ?", userID).First(user).Error; err != nil {
			return nil, errors.New("failed to get user info")
		}
		return user, nil
	})

	http.HandleFunc("/tether", engine.Handle)
	http.ListenAndServe(":8080", nil)
}
