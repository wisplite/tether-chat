package main

import (
	"encoding/json"
	"strings"
	"sync"
	"testing"

	"github.com/recodeorg/tether"
)

func TestChannelInvitations(t *testing.T) {
	db := orderDB(t)
	if err := db.AutoMigrate(&User{}, &ChannelMember{}); err != nil {
		t.Fatal(err)
	}
	admin := true
	auth := &tether.AuthCtx{ExecuteGuard: func(name string, params map[string]any) (any, error) {
		if name != "isAdmin" {
			t.Fatalf("unexpected guard: %s", name)
		}
		return admin, nil
	}}
	mutate := func(params map[string]any) (any, error) {
		return inviteToChannel(&tether.MutationCtx{DB: db, Auth: auth, Params: params})
	}
	query := func(params map[string]any) (any, error) {
		return getChannelInvitees(&tether.QueryCtx{DB: db, Auth: auth, Params: params})
	}
	for _, user := range []User{
		{ID: "admin", Username: "admin", Role: "admin"},
		{ID: "member", Username: "member", Role: "user", Password: "secret-password"},
		{ID: "other", Username: "other", Role: "user"},
	} {
		if err := db.Create(&user).Error; err != nil {
			t.Fatal(err)
		}
	}
	for _, channel := range []Channel{{ID: "private", IsPrivate: true}, {ID: "public"}} {
		if err := db.Create(&channel).Error; err != nil {
			t.Fatal(err)
		}
	}
	params := map[string]any{"channelID": "private", "userID": "member"}
	admin = false
	if _, err := mutate(params); err == nil {
		t.Fatal("non-admin can invite")
	}
	if _, err := query(params); err == nil {
		t.Fatal("non-admin can list invitees")
	}
	admin = true
	for _, invalid := range []map[string]any{
		{"userID": "member"}, {"channelID": "private"},
		{"channelID": 123, "userID": "member"},
		{"channelID": "public", "userID": "member"},
		{"channelID": "missing", "userID": "member"},
		{"channelID": "private", "userID": "missing"},
		{"channelID": "private", "userID": ""},
	} {
		if _, err := mutate(invalid); err == nil {
			t.Fatalf("accepted invalid invitation: %v", invalid)
		}
	}
	result, err := query(params)
	if err != nil {
		t.Fatal(err)
	}
	encoded, _ := json.Marshal(result)
	if strings.Contains(string(encoded), "Password") || strings.Contains(string(encoded), "admin") || !strings.Contains(string(encoded), "member") {
		t.Fatalf("unexpected invitees: %s", encoded)
	}
	// Concurrent/repeated invites must create just one membership.
	var wg sync.WaitGroup
	for range 5 {
		wg.Go(func() {
			if _, err := mutate(params); err != nil {
				t.Error(err)
			}
		})
	}
	wg.Wait()
	var members []ChannelMember
	if err := db.Find(&members).Error; err != nil {
		t.Fatal(err)
	}
	if len(members) != 1 || members[0].UserID != "member" || members[0].ChannelID != "private" {
		t.Fatalf("unexpected memberships: %+v", members)
	}
	result, err = query(params)
	if err != nil {
		t.Fatal(err)
	}
	encoded, _ = json.Marshal(result)
	if strings.Contains(string(encoded), "member") || !strings.Contains(string(encoded), "other") {
		t.Fatalf("invited person is still a candidate: %s", encoded)
	}
	if _, err := mutate(map[string]any{"channelID": "private", "userID": "admin"}); err != nil {
		t.Fatal(err)
	}
	var count int64
	db.Model(&ChannelMember{}).Count(&count)
	if count != 1 {
		t.Fatal("admin invitation created redundant membership")
	}
}
