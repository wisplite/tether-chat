package main

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io/fs"
	"log"
	"mime"
	"regexp"
	"slices"
	"strings"
	"time"

	"embed"
	"net/http"

	dicebear "github.com/dicebear/dicebear-go/v10"
	"github.com/dicebear/styles/v10"

	"log/slog"

	"github.com/google/uuid"
	"github.com/joho/godotenv"
	"github.com/recodeorg/tether"
	"github.com/recodeorg/tether/storage"
	"github.com/recodeorg/tether/storage/s3"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

//go:embed frontend/dist/*
var frontend embed.FS

const GormSQLiteTimeLayout = "2006-01-02 15:04:05.999999999-07:00"

type User struct {
	ID           string `gorm:"primaryKey" tether:"track"`
	Username     string `gorm:"unique"`
	Nickname     string
	Password     string
	AvatarUrl    string
	Role         string `gorm:"index" tether:"track"`
	Status       string
	Presence     string
	Bio          string
	ProfileColor string
	LastActive   time.Time
	CreatedAt    time.Time
	UpdatedAt    time.Time
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
	Rank      string `gorm:"uniqueIndex;default:null"`
	IsPrivate bool
	CreatedAt time.Time
	UpdatedAt time.Time
}

type ChannelMember struct {
	ID        string `gorm:"primaryKey"`
	ChannelID string `gorm:"index" tether:"track"`
	UserID    string `gorm:"index" tether:"track"`
	CreatedAt time.Time
	UpdatedAt time.Time
}

type Message struct {
	ID          string `gorm:"primaryKey"`
	ChannelID   string `tether:"track" gorm:"index"`
	UserID      string `gorm:"index"`
	Content     string
	Attachments []string `gorm:"serializer:json"`
	CreatedAt   time.Time
	UpdatedAt   time.Time
}

type AttachmentMetadata struct {
	ID        string `gorm:"primaryKey"`
	Filename  string
	CreatedAt time.Time
	UpdatedAt time.Time
}

type Auth struct{}

func attachmentIDsFromMessages(messages []Message) []string {
	attachmentIDs := []string{}
	for _, message := range messages {
		attachmentIDs = append(attachmentIDs, message.Attachments...)
	}
	return attachmentIDs
}

const avatarURLPrefix = "/storage/public/"

const maxAvatarBytes = 5 * 1024 * 1024

var allowedAvatarTypes = map[string]struct{}{
	"image/jpeg": {},
	"image/png":  {},
	"image/gif":  {},
	"image/webp": {},
}

var profileColorPattern = regexp.MustCompile(`^#[0-9a-f]{6}$`)

func publicFileID(url string) (string, bool) {
	if !strings.HasPrefix(url, avatarURLPrefix) {
		return "", false
	}
	id := strings.TrimPrefix(url, avatarURLPrefix)
	if id == "" || strings.ContainsAny(id, "/\\") {
		return "", false
	}
	return id, true
}

func deleteAttachmentFiles(ctx *tether.MutationCtx, attachmentIDs []string) error {
	for _, attachmentID := range attachmentIDs {
		if attachmentID == "" {
			continue
		}
		if err := ctx.Storage.DeleteFile(attachmentID); err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
			return err
		}
	}
	return nil
}

func (a *Auth) VerifyToken(ctx context.Context, db *gorm.DB, token string) (string, time.Time, error) {
	tokenModel := &Token{}
	if err := db.Where("token = ?", token).First(tokenModel).Error; err != nil {
		return "", time.Time{}, errors.New("invalid token")
	}
	return tokenModel.UserID, tokenModel.CreatedAt.Add(time.Hour * 24), nil
}

func main() {
	err := godotenv.Load()
	if err != nil {
		panic("failed to load environment variables")
	}
	db, err := gorm.Open(sqlite.Open("tether.db?_txlock=immediate&_busy_timeout=5000"), &gorm.Config{})
	if err != nil {
		panic("failed to connect database")
	}
	engine, err := tether.NewEngine(db)
	if err != nil {
		panic("failed to create engine")
	}

	slog.SetLogLoggerLevel(slog.LevelDebug)

	engine.SetAuth(&Auth{})

	engine.CreateTable(&User{})
	engine.CreateTable(&Token{})
	if err := engine.CreateTable(&Channel{}); err != nil {
		panic(err)
	}
	if err := migrateChannelRanks(db); err != nil {
		panic(err)
	}
	engine.CreateTable(&ChannelMember{})
	registerChannelInvitations(engine)
	engine.CreateTable(&Message{})
	engine.CreateTable(&AttachmentMetadata{})

	engine.RegisterCron("offlineUsers", "*/2 * * * *", "offlineUsers", map[string]any{})

	engine.RegisterMutation("offlineUsers", func(ctx *tether.MutationCtx) (any, error) {
		if err := ctx.DB.Model(&User{}).Where("presence = ? AND last_active < ?", "online", time.Now().Add(-time.Minute*2)).Update("presence", "offline").Error; err != nil {
			return nil, errors.New("failed to update offline users")
		}
		return nil, nil
	}, tether.Internal())

	s3Storage, err := s3.New(context.Background(), s3.Config{
		Region:   "auto",
		Endpoint: "https://2203f5be0b0d981e27566cb0327d7002.r2.cloudflarestorage.com/tether-chat",
	})
	if err != nil {
		panic("failed to create storage")
	}

	engine.SetStorage(s3Storage, "/storage")

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

	engine.RegisterGuard("isMessageOwner", func(ctx *tether.GuardCtx) (any, error) {
		userID, err := ctx.Auth.GetIdentity()
		if err != nil {
			return false, nil
		}
		if userID == "" {
			return false, nil
		}
		messageID, ok := ctx.Params["messageID"].(string)
		if !ok {
			return false, nil
		}
		message := &Message{}
		if err := ctx.DB.Where("id = ?", messageID).First(message).Error; err != nil {
			return false, nil
		}
		if message.UserID != userID {
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

		user := &User{}
		if err := ctx.DB.Where("id = ?", userID).First(user).Error; err != nil {
			return []string{}, nil
		}
		if user.Role == "admin" {
			channels := []Channel{}
			if err := ctx.DB.Find(&channels).Error; err != nil {
				return []string{}, nil
			}
			for _, channel := range channels {
				channelIDs = append(channelIDs, channel.ID)
			}
			return channelIDs, nil
		}
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
		user := &User{}
		if err := ctx.DB.Where("id = ?", userID).First(user).Error; err != nil {
			return false, nil
		}
		if user.Role == "admin" {
			return true, nil
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
		if !channel.IsPrivate {
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

	engine.RegisterGuard("isUser", func(ctx *tether.GuardCtx) (any, error) {
		userID, err := ctx.Auth.GetIdentity()
		if err != nil {
			return false, nil
		}
		if userID == "" {
			return false, nil
		}
		user := &User{}
		if err := ctx.DB.Where("id = ?", userID).First(user).Error; err != nil {
			return false, nil
		}
		return true, nil
	})

	engine.RegisterMutation("heartbeat", func(ctx *tether.MutationCtx) (any, error) {
		userID, err := ctx.Auth.GetIdentity()
		if err != nil {
			return nil, errors.New("unauthorized")
		}
		if userID == "" {
			return nil, errors.New("unauthorized")
		}
		user := &User{}
		if err := ctx.DB.Where("id = ?", userID).First(user).Error; err != nil {
			return nil, errors.New("unauthorized")
		}
		user.LastActive = time.Now()
		user.Presence = "online"
		if err := ctx.DB.Save(user).Error; err != nil {
			return nil, errors.New("failed to update last active")
		}
		return nil, nil
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
		// if first user, make admin
		userCount := int64(0)
		if err := ctx.DB.Model(&User{}).Limit(1).Count(&userCount).Error; err != nil {
			return nil, errors.New("failed to count users")
		}

		user := &User{
			ID:           uuid.New().String(),
			Username:     username,
			Nickname:     username,
			Bio:          "",
			Role:         "member",
			ProfileColor: "#3d60bb",
			Password:     string(hashedPassword),
		}
		if userCount == 0 {
			user.Role = "admin"
		}
		if err := ctx.DB.Create(user).Error; err != nil {
			return nil, errors.New("failed to create user")
		}
		ctx.ExecuteMutation("generateAvatar", map[string]any{
			"username": username,
			"userID":   user.ID,
		})
		return map[string]any{
			"userID": user.ID,
		}, nil
	})

	engine.RegisterMutation("generateAvatar", func(ctx *tether.MutationCtx) (any, error) {
		username, ok := ctx.Params["username"].(string)
		if !ok {
			return nil, errors.New("username is required")
		}
		userID, ok := ctx.Params["userID"].(string)
		if !ok {
			return nil, errors.New("unauthorized")
		}
		style, err := dicebear.NewStyle([]byte(styles.Waves))
		if err != nil {
			return nil, errors.New("failed to create style")
		}
		avatar, err := dicebear.NewAvatar(style, map[string]any{
			"seed": username,
			"size": 128,
		})
		avatarSVGString := avatar.SVG()

		fileID, err := ctx.Storage.PutFile("image/svg+xml", strings.NewReader(avatarSVGString), storage.Public())
		if err != nil {
			return nil, errors.New("failed to upload avatar")
		}

		err = ctx.DB.Model(&User{}).Where("id = ?", userID).Update("avatar_url", fmt.Sprintf("/storage/public/%s", fileID)).Error
		if err != nil {
			return nil, errors.New("failed to update avatar url")
		}

		return avatarSVGString, nil
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
		if err := ctx.DB.Transaction(func(tx *gorm.DB) error { return appendChannel(tx, channel) }); err != nil {
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

	engine.RegisterMutation("reorderChannel", func(ctx *tether.MutationCtx) (any, error) {
		admin, err := ctx.Auth.ExecuteGuard("isAdmin", map[string]any{})
		if err != nil || admin != true {
			return nil, errors.New("unauthorized")
		}
		channelID, ok := ctx.Params["channelID"].(string)
		if !ok || channelID == "" {
			return nil, errors.New("channelID is required")
		}
		beforeID, ok := ctx.Params["beforeID"].(string)
		if !ok {
			return nil, errors.New("beforeID is required (empty means end)")
		}
		return moveChannel(ctx.DB, channelID, beforeID)
	})

	engine.RegisterQuery("getChannels", func(ctx *tether.QueryCtx) (any, error) {
		permittedChannels, err := ctx.Auth.ExecuteGuard("permittedChannels", map[string]any{})
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
		if err := ctx.DB.Where("id IN (?)", ids).Order("rank, id").Find(&channels).Error; err != nil {
			return nil, errors.New("failed to get channels")
		}
		return channels, nil
	})

	engine.RegisterQuery("getChannel", func(ctx *tether.QueryCtx) (any, error) {
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
		channel := &Channel{}
		if err := ctx.DB.Where("id = ?", channelID).First(channel).Error; err != nil {
			return nil, errors.New("failed to get channel")
		}
		return channel, nil
	})

	engine.RegisterQuery("getMessages", func(ctx *tether.QueryCtx) (any, error) {
		channelID, ok := ctx.Params["channelID"].(string)
		if !ok {
			return nil, errors.New("channelID is required")
		}
		startCursorString, ok := ctx.Params["StartCursor"].(string)
		if !ok {
			startCursorString = ""
		}
		endCursorString, ok := ctx.Params["EndCursor"].(string)
		if !ok {
			endCursorString = ""
		}
		startCursor, err := time.Parse(time.RFC3339Nano, startCursorString)
		if err != nil {
			startCursor = time.Time{}
		}
		endCursor, err := time.Parse(time.RFC3339Nano, endCursorString)
		if err != nil {
			endCursor = time.Time{}
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
		messages := []Message{}
		q := ctx.DB.Where("channel_id = ?", channelID).Order("created_at DESC").Limit(30)
		if !startCursor.IsZero() {
			q = q.Where("created_at < ?", startCursor)
		}
		if !endCursor.IsZero() {
			q = q.Where("created_at > ?", endCursor)
		}
		if startCursor.IsZero() {
			ctx.TrackCollection("messages", "channel_id", channelID)
		}
		if err := q.Find(&messages).Error; err != nil {
			return nil, errors.New("failed to get messages")
		}
		userIDs := make([]string, 0, len(messages))
		for _, message := range messages {
			if !slices.Contains(userIDs, message.UserID) {
				userIDs = append(userIDs, message.UserID)
			}
		}
		users := []User{}
		if err := ctx.DB.Where("id IN (?)", userIDs).Find(&users).Error; err != nil {
			return nil, errors.New("failed to get users")
		}
		messagesWithUsers := make([]map[string]any, 0, len(messages))
		for _, message := range messages {
			attachments := []map[string]any{}
			for _, attachmentID := range message.Attachments {
				attachment := &AttachmentMetadata{}
				if err := ctx.DB.Where("id = ?", attachmentID).First(attachment).Error; err != nil {
					continue
				}
				downloadURL, err := ctx.Storage.GetDownloadURL(attachmentID, storage.WithDownloadExpiresIn(time.Hour*24), storage.UseCachedURLs())
				if err != nil {
					continue
				}
				attachments = append(attachments, map[string]any{
					"url":      downloadURL,
					"filename": attachment.Filename,
				})
			}
			for _, user := range users {
				if message.UserID == user.ID {
					messagesWithUsers = append(messagesWithUsers, map[string]any{
						"message": map[string]any{
							"ID":          message.ID,
							"Content":     message.Content,
							"Attachments": attachments,
							"CreatedAt":   message.CreatedAt,
							"UpdatedAt":   message.UpdatedAt,
						},
						"user": map[string]any{ // rebuild the user object to avoid revealing sensitive data
							"id":           user.ID,
							"username":     user.Username,
							"nickname":     user.Nickname,
							"avatarUrl":    user.AvatarUrl,
							"role":         user.Role,
							"status":       user.Status,
							"presence":     user.Presence,
							"profileColor": user.ProfileColor,
						},
					})
					break
				}
			}
		}
		endCursorClient := ""
		startCursorClient := ""
		if len(messages) > 0 {
			endCursorClient = messages[len(messages)-1].CreatedAt.Format(time.RFC3339Nano)
		}
		if len(messages) > 0 {
			startCursorClient = messages[0].CreatedAt.Format(time.RFC3339Nano)
		}
		return map[string]any{
			"Data":        messagesWithUsers,
			"EndCursor":   endCursorClient,
			"StartCursor": startCursorClient,
			"HasMore":     len(messages) == 30,
			"MaxSize":     30,
		}, nil
	})

	sanitizeUsers := func(users []User) []User {
		sanitizedUsers := make([]User, 0, len(users))
		for _, user := range users {
			sanitizedUsers = append(sanitizedUsers, User{
				ID:           user.ID,
				Username:     user.Username,
				Nickname:     user.Nickname,
				AvatarUrl:    user.AvatarUrl,
				Role:         user.Role,
				Status:       user.Status,
				Presence:     user.Presence,
				ProfileColor: user.ProfileColor,
				LastActive:   user.LastActive,
			})
		}
		return sanitizedUsers
	}

	engine.RegisterQuery("getChannelMembers", func(ctx *tether.QueryCtx) (any, error) {
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
		// check if channel is private
		channel := &Channel{}
		if err := ctx.DB.Where("id = ?", channelID).First(channel).Error; err != nil {
			return nil, errors.New("failed to get channel")
		}
		if channel.IsPrivate {
			// get all channel members, as this is a private channel
			ctx.TrackCollection("channel_members", "channel_id", channelID)
			ctx.TrackCollection("users", "role", "admin")
			channelMembers := []ChannelMember{}
			if err := ctx.DB.Where("channel_id = ?", channelID).Find(&channelMembers).Error; err != nil {
				return nil, errors.New("failed to get channel members")
			}
			admins := []User{}
			if err := ctx.DB.Where("role = ?", "admin").Find(&admins).Error; err != nil {
				return nil, errors.New("failed to get admins")
			}
			userIDs := make([]string, 0, len(channelMembers))
			for _, channelMember := range channelMembers {
				userIDs = append(userIDs, channelMember.UserID)
			}
			for _, admin := range admins {
				if !slices.Contains(userIDs, admin.ID) {
					userIDs = append(userIDs, admin.ID)
				}
			}
			users := []User{}
			if err := ctx.DB.Where("id IN (?)", userIDs).Find(&users).Error; err != nil {
				return nil, errors.New("failed to get users")
			}
			return sanitizeUsers(users), nil
		} else {
			// get all users, as this is a public channel
			ctx.TrackTable("users")
			users := []User{}
			if err := ctx.DB.Find(&users).Error; err != nil {
				return nil, errors.New("failed to get users")
			}
			return sanitizeUsers(users), nil
		}
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

	engine.RegisterQuery("getUser", func(ctx *tether.QueryCtx) (any, error) {
		isUser, err := ctx.Auth.ExecuteGuard("isUser", map[string]any{})
		if err != nil {
			return nil, errors.New("unauthorized")
		}
		isUserBool, ok := isUser.(bool)
		if !ok {
			return nil, errors.New("unauthorized")
		}
		if !isUserBool {
			return nil, errors.New("unauthorized")
		}
		userID, ok := ctx.Params["userID"].(string)
		if !ok {
			return nil, errors.New("userID is required")
		}
		user := &User{}
		if err := ctx.DB.Where("id = ?", userID).First(user).Error; err != nil {
			return nil, errors.New("failed to get user")
		}
		sanitizedUser := User{
			ID:           user.ID,
			Username:     user.Username,
			Nickname:     user.Nickname,
			AvatarUrl:    user.AvatarUrl,
			Role:         user.Role,
			Status:       user.Status,
			Presence:     user.Presence,
			Bio:          user.Bio,
			ProfileColor: user.ProfileColor,
			CreatedAt:    user.CreatedAt,
		}
		return sanitizedUser, nil
	})

	engine.RegisterMutation("sendMessage", func(ctx *tether.MutationCtx) (any, error) {
		channelID, ok := ctx.Params["channelID"].(string)
		if !ok {
			return nil, errors.New("channelID is required")
		}
		message, ok := ctx.Params["message"].(string)
		if !ok {
			return nil, errors.New("message is required")
		}
		raw, ok := ctx.Params["attachments"].([]any)
		if !ok {
			raw = []any{}
		}
		attachments := make([]AttachmentMetadata, 0, len(raw))
		attachmentIDs := make([]string, 0, len(raw))
		for _, attachment := range raw {
			attachmentMetadata, ok := attachment.(map[string]any)
			if !ok {
				return nil, errors.New("attachments must be maps")
			}
			id, ok := attachmentMetadata["id"].(string)
			if !ok {
				return nil, errors.New("id is required")
			}
			filename, ok := attachmentMetadata["filename"].(string)
			if !ok {
				return nil, errors.New("filename is required")
			}
			timestamp := time.Now()
			attachments = append(attachments, AttachmentMetadata{
				ID:        id,
				Filename:  filename,
				CreatedAt: timestamp,
				UpdatedAt: timestamp,
			})
			attachmentIDs = append(attachmentIDs, id)
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
		userID, err := ctx.Auth.GetIdentity()
		if err != nil {
			return nil, errors.New("unauthorized")
		}
		messageModel := &Message{
			ID:          uuid.New().String(),
			ChannelID:   channelID,
			UserID:      userID,
			Content:     message,
			Attachments: attachmentIDs,
		}
		err = ctx.DB.Transaction(func(tx *gorm.DB) error {
			for _, attachment := range attachments {
				if err := tx.Create(&attachment).Error; err != nil {
					return err
				}
			}
			return tx.Create(messageModel).Error
		})
		if err != nil {
			return nil, errors.New("failed to send message")
		}
		return messageModel, nil
	})

	engine.RegisterMutation("uploadFile", func(ctx *tether.MutationCtx) (any, error) {
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
		fileInfo, err := ctx.Storage.GetUploadURL(storage.WithMaxBytes(1024 * 1024 * 500))
		if err != nil {
			return nil, errors.New("failed to get upload URL")
		}
		return map[string]any{
			"uploadURL": fileInfo.UploadURL,
			"fileID":    fileInfo.FileID,
		}, nil
	})

	engine.RegisterMutation("updateChannel", func(ctx *tether.MutationCtx) (any, error) {
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
		channelID, ok := ctx.Params["channelID"].(string)
		if !ok {
			return nil, errors.New("channelID is required")
		}
		channelName, ok := ctx.Params["channelName"].(string)
		if !ok {
			return nil, errors.New("channelName is required")
		}
		isPrivate, ok := ctx.Params["isPrivate"].(bool)
		if !ok {
			return nil, errors.New("isPrivate is required")
		}
		channel := &Channel{}
		if err := ctx.DB.Where("id = ?", channelID).First(channel).Error; err != nil {
			return nil, errors.New("failed to get channel")
		}
		channel.Name = channelName
		channel.IsPrivate = isPrivate
		if err := ctx.DB.Model(channel).Select("Name", "IsPrivate").Updates(channel).Error; err != nil {
			return nil, errors.New("failed to update channel")
		}
		return channel, nil
	})

	engine.RegisterMutation("deleteChannel", func(ctx *tether.MutationCtx) (any, error) {
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
		channelID, ok := ctx.Params["channelID"].(string)
		if !ok {
			return nil, errors.New("channelID is required")
		}
		messages := []Message{}
		if err := ctx.DB.Where("channel_id = ?", channelID).Find(&messages).Error; err != nil {
			return nil, errors.New("failed to delete channel")
		}
		attachmentIDs := attachmentIDsFromMessages(messages)
		if err := deleteAttachmentFiles(ctx, attachmentIDs); err != nil {
			return nil, errors.New("failed to delete attachments")
		}
		err = ctx.DB.Transaction(func(tx *gorm.DB) error {
			if len(attachmentIDs) > 0 {
				if err := tx.Where("id IN (?)", attachmentIDs).Delete(&AttachmentMetadata{}).Error; err != nil {
					return err
				}
			}
			if err := tx.Where("channel_id = ?", channelID).Delete(&Message{}).Error; err != nil {
				return err
			}
			if err := tx.Where("channel_id = ?", channelID).Delete(&ChannelMember{}).Error; err != nil {
				return err
			}
			return tx.Where("id = ?", channelID).Delete(&Channel{}).Error
		})
		if err != nil {
			return nil, errors.New("failed to delete channel")
		}
		return map[string]any{
			"success": true,
		}, nil
	})

	engine.RegisterMutation("deleteMessage", func(ctx *tether.MutationCtx) (any, error) {
		messageID, ok := ctx.Params["messageID"].(string)
		if !ok {
			return nil, errors.New("messageID is required")
		}
		isMessageOwner, err := ctx.Auth.ExecuteGuard("isMessageOwner", map[string]any{
			"messageID": messageID,
		})
		if err != nil {
			return nil, errors.New("unauthorized")
		}
		isAdmin, err := ctx.Auth.ExecuteGuard("isAdmin", map[string]any{})
		if err != nil {
			return nil, errors.New("unauthorized")
		}
		isAdminBool, ok := isAdmin.(bool)
		if !ok {
			return nil, errors.New("unauthorized")
		}
		isMessageOwnerBool, ok := isMessageOwner.(bool)
		if !ok {
			return nil, errors.New("unauthorized")
		}
		if !isMessageOwnerBool && !isAdminBool {
			return nil, errors.New("unauthorized")
		}
		message := &Message{}
		if err := ctx.DB.Where("id = ?", messageID).First(message).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return map[string]any{
					"success": true,
				}, nil
			}
			return nil, errors.New("failed to delete message")
		}
		if len(message.Attachments) > 0 {
			if err := deleteAttachmentFiles(ctx, message.Attachments); err != nil {
				return nil, errors.New("failed to delete attachments")
			}
		}
		err = ctx.DB.Transaction(func(tx *gorm.DB) error {
			if len(message.Attachments) > 0 {
				if err := tx.Where("id IN (?)", message.Attachments).Delete(&AttachmentMetadata{}).Error; err != nil {
					return err
				}
			}
			return tx.Where("id = ?", messageID).Delete(&Message{}).Error
		})
		if err != nil {
			return nil, errors.New("failed to delete message")
		}
		return map[string]any{
			"success": true,
		}, nil
	})

	engine.RegisterMutation("editMessage", func(ctx *tether.MutationCtx) (any, error) {
		messageID, ok := ctx.Params["messageID"].(string)
		if !ok {
			return nil, errors.New("messageID is required")
		}
		message, ok := ctx.Params["message"].(string)
		if !ok {
			return nil, errors.New("message is required")
		}
		isMessageOwner, err := ctx.Auth.ExecuteGuard("isMessageOwner", map[string]any{
			"messageID": messageID,
		})
		if err != nil {
			return nil, errors.New("unauthorized")
		}
		isMessageOwnerBool, ok := isMessageOwner.(bool)
		if !ok {
			return nil, errors.New("unauthorized")
		}
		if !isMessageOwnerBool {
			return nil, errors.New("unauthorized")
		}
		if err := ctx.DB.Model(&Message{}).Where("id = ?", messageID).Update("content", message).Error; err != nil {
			return nil, errors.New("failed to edit message")
		}
		return map[string]any{
			"success": true,
		}, nil
	})

	engine.RegisterMutation("uploadAvatar", func(ctx *tether.MutationCtx) (any, error) {
		if _, err := ctx.Auth.GetIdentity(); err != nil {
			return nil, errors.New("unauthorized")
		}
		fileInfo, err := ctx.Storage.GetUploadURL(storage.Public(), storage.WithMaxBytes(maxAvatarBytes))
		if err != nil {
			return nil, errors.New("failed to get upload URL")
		}
		return map[string]any{
			"uploadURL": fileInfo.UploadURL,
			"fileID":    fileInfo.FileID,
		}, nil
	})

	engine.RegisterMutation("updateProfile", func(ctx *tether.MutationCtx) (any, error) {
		userID, err := ctx.Auth.GetIdentity()
		if err != nil {
			return nil, errors.New("unauthorized")
		}

		user := &User{}
		if err := ctx.DB.Where("id = ?", userID).First(user).Error; err != nil {
			return nil, errors.New("failed to get user")
		}
		previousAvatar := user.AvatarUrl

		// A missing or null field is left unchanged. A string, including "",
		// is written as sent, except nickname, which cannot be blank.
		if raw, exists := ctx.Params["nickname"]; exists && raw != nil {
			nickname, ok := raw.(string)
			if !ok {
				return nil, errors.New("nickname is required")
			}
			nickname = strings.TrimSpace(nickname)
			if nickname == "" {
				return nil, errors.New("nickname is required")
			}
			user.Nickname = nickname
		}
		if raw, exists := ctx.Params["status"]; exists && raw != nil {
			status, ok := raw.(string)
			if !ok {
				return nil, errors.New("status must be text")
			}
			user.Status = status
		}
		if raw, exists := ctx.Params["bio"]; exists && raw != nil {
			bio, ok := raw.(string)
			if !ok {
				return nil, errors.New("bio must be text")
			}
			user.Bio = bio
		}
		if raw, exists := ctx.Params["profileColor"]; exists && raw != nil {
			color, ok := raw.(string)
			if !ok {
				return nil, errors.New("profile color must be a hex color like #3d60bb")
			}
			color = strings.ToLower(strings.TrimSpace(color))
			if !profileColorPattern.MatchString(color) {
				return nil, errors.New("profile color must be a hex color like #3d60bb")
			}
			user.ProfileColor = color
		}
		if raw, exists := ctx.Params["avatarFileID"]; exists && raw != nil {
			fileID, ok := raw.(string)
			if !ok || strings.TrimSpace(fileID) == "" {
				return nil, errors.New("photo not found")
			}
			record := &tether.TetherStorage{}
			if err := ctx.DB.Where("id = ? AND status = ? AND public = ?", fileID, "active", true).First(record).Error; err != nil {
				return nil, errors.New("photo not found")
			}
			mediaType, _, err := mime.ParseMediaType(record.MimeType)
			if err != nil {
				mediaType = ""
			}
			if _, ok := allowedAvatarTypes[mediaType]; !ok {
				_ = ctx.Storage.DeleteFile(fileID)
				return nil, errors.New("photo must be a JPEG, PNG, GIF, or WebP image")
			}
			user.AvatarUrl = avatarURLPrefix + record.ID
		}

		if err := ctx.DB.Save(user).Error; err != nil {
			if user.AvatarUrl != previousAvatar {
				if id, ok := publicFileID(user.AvatarUrl); ok {
					_ = ctx.Storage.DeleteFile(id)
				}
			}
			return nil, errors.New("failed to update profile")
		}

		if user.AvatarUrl != previousAvatar {
			if id, ok := publicFileID(previousAvatar); ok {
				var stillUsed int64
				if err := ctx.DB.Model(&User{}).Where("avatar_url = ?", previousAvatar).Count(&stillUsed).Error; err == nil && stillUsed == 0 {
					_ = ctx.Storage.DeleteFile(id)
				}
			}
		}

		user.Password = ""
		return user, nil
	})

	distFS, err := fs.Sub(frontend, "frontend/dist")
	if err != nil {
		log.Fatal(err)
	}

	fileServer := http.FileServer(http.FS(distFS))
	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		filePath := r.URL.Path[1:]

		f, err := distFS.Open(filePath)
		if err == nil {
			f.Close()
		}
		if errors.Is(err, fs.ErrNotExist) && filePath != "" {
			data, err := fs.ReadFile(distFS, "index.html")
			if err != nil {
				http.NotFound(w, r)
				return
			}
			http.ServeContent(w, r, "index.html", time.Time{}, bytes.NewReader(data))
			return
		}
		fileServer.ServeHTTP(w, r)
	})
	http.HandleFunc("/tether", engine.Handle)
	http.HandleFunc("/storage/", engine.StorageHandler)
	http.ListenAndServe(":4050", nil)
}
