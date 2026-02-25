package updater

import (
	"encoding/json"
	"net/http"
	"runtime"
	"time"
)

const (
	checkURL = "https://xyzen.ai/xyzen/api/v1/runners/cli/latest"
	timeout  = 5 * time.Second
)

type versionResponse struct {
	Version        string            `json:"version"`
	Download       map[string]string `json:"download"`
	InstallCommand string            `json:"install_command"`
}

// UpdateInfo contains information about an available update.
type UpdateInfo struct {
	Latest      string // latest version (e.g. "0.2.0")
	DownloadURL string // platform-specific binary URL
}

// CheckForUpdate fetches the latest CLI version from the server and compares
// it with the current version. Returns nil if up-to-date or on any error.
func CheckForUpdate(currentVersion string) *UpdateInfo {
	client := &http.Client{Timeout: timeout}
	resp, err := client.Get(checkURL)
	if err != nil {
		return nil
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil
	}

	var v versionResponse
	if err := json.NewDecoder(resp.Body).Decode(&v); err != nil {
		return nil
	}

	if v.Version == currentVersion {
		return nil
	}

	platform := runtime.GOOS + "-" + runtime.GOARCH
	downloadURL := v.Download[platform]

	return &UpdateInfo{
		Latest:      v.Version,
		DownloadURL: downloadURL,
	}
}
