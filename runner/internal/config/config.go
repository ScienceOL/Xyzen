package config

import (
	"fmt"
	"os"
	"path/filepath"

	"gopkg.in/yaml.v3"
)

type Config struct {
	Token     string `yaml:"token"`
	URL       string `yaml:"url"`
	WorkDir   string `yaml:"work_dir"`
	KeepAwake bool   `yaml:"keep_awake"`
}

// Load resolves configuration from flags > env > config file.
func Load(flagToken, flagURL, flagWorkDir string, flagKeepAwake bool) (*Config, error) {
	cfg := &Config{}

	// 1. Load config file as base
	if cfgPath := configFilePath(); cfgPath != "" {
		if data, err := os.ReadFile(cfgPath); err == nil {
			_ = yaml.Unmarshal(data, cfg)
		}
	}

	// 2. Environment variables override config file
	if v := os.Getenv("XYZEN_RUNNER_TOKEN"); v != "" {
		cfg.Token = v
	}
	if v := os.Getenv("XYZEN_RUNNER_URL"); v != "" {
		cfg.URL = v
	}
	if v := os.Getenv("XYZEN_RUNNER_WORK_DIR"); v != "" {
		cfg.WorkDir = v
	}

	// 2b. Environment variable for keep_awake
	if v := os.Getenv("XYZEN_RUNNER_KEEP_AWAKE"); v == "1" || v == "true" {
		cfg.KeepAwake = true
	}

	// 3. CLI flags override everything
	if flagToken != "" {
		cfg.Token = flagToken
	}
	if flagURL != "" {
		cfg.URL = flagURL
	}
	if flagWorkDir != "" {
		cfg.WorkDir = flagWorkDir
	}
	if flagKeepAwake {
		cfg.KeepAwake = true
	}

	// Validate required fields
	if cfg.Token == "" {
		return nil, fmt.Errorf("runner token is required (--token, XYZEN_RUNNER_TOKEN, or config file)")
	}
	if cfg.URL == "" {
		return nil, fmt.Errorf("server URL is required (--url, XYZEN_RUNNER_URL, or config file)")
	}

	// Default working directory to cwd
	if cfg.WorkDir == "" {
		cwd, err := os.Getwd()
		if err != nil {
			return nil, fmt.Errorf("failed to get current directory: %w", err)
		}
		cfg.WorkDir = cwd
	}

	// Resolve to absolute path
	abs, err := filepath.Abs(cfg.WorkDir)
	if err != nil {
		return nil, fmt.Errorf("invalid work directory: %w", err)
	}
	cfg.WorkDir = abs

	return cfg, nil
}

func configFilePath() string {
	home, err := os.UserHomeDir()
	if err != nil {
		return ""
	}
	p := filepath.Join(home, ".xyzen", "config.yaml")
	if _, err := os.Stat(p); err == nil {
		return p
	}
	return ""
}
