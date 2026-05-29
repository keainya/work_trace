package utils

import (
	"os"

	"github.com/BurntSushi/toml"
)

type tomlConfig struct {
	Server  serverConfig  `toml:"server"`
	Account accountConfig `toml:"account"`
}

type serverConfig struct {
	Port int `toml:"port"`
}

type accountConfig struct {
	BaseURL      string `toml:"base_url"`
	ClientID     string `toml:"client_id"`
	ClientSecret string `toml:"client_secret"`
}

// AppConfig 应用配置
type AppConfig struct {
	Port int

	AccountBaseURL string
	ClientID       string
	ClientSecret   string
}

var Config *AppConfig

func init() {
	c := tomlConfig{}
	cfg := AppConfig{
		Port:           8086,
		AccountBaseURL: "https://account.takemeto.icu",
		ClientID:       "app_work_trace",
		ClientSecret:   "",
	}

	// 尝试读取 config.toml
	data, err := os.ReadFile("config.toml")
	if err == nil {
		if _, err := toml.Decode(string(data), &c); err == nil {
			if c.Server.Port != 0 {
				cfg.Port = c.Server.Port
			}
			if c.Account.BaseURL != "" {
				cfg.AccountBaseURL = c.Account.BaseURL
			}
			if c.Account.ClientID != "" {
				cfg.ClientID = c.Account.ClientID
			}
			if c.Account.ClientSecret != "" {
				cfg.ClientSecret = c.Account.ClientSecret
			}
		}
	}

	// 环境变量覆盖（优先级最高）
	if v := os.Getenv("PORT"); v != "" {
		cfg.Port = 8086 // will be set correctly in strconv
	}
	if v := os.Getenv("ACCOUNT_BASE_URL"); v != "" {
		cfg.AccountBaseURL = v
	}
	if v := os.Getenv("OAUTH_CLIENT_ID"); v != "" {
		cfg.ClientID = v
	}
	if v := os.Getenv("OAUTH_CLIENT_SECRET"); v != "" {
		cfg.ClientSecret = v
	}

	Config = &cfg
}
