package updater

import (
	"encoding/json"
	"fmt"
	"net/http"
	"runtime"
	"strconv"
	"strings"
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

	if !isNewer(v.Version, currentVersion) {
		return nil
	}

	platform := runtime.GOOS + "-" + runtime.GOARCH
	downloadURL := v.Download[platform]

	return &UpdateInfo{
		Latest:      v.Version,
		DownloadURL: downloadURL,
	}
}

// isNewer returns true if remote is strictly newer than local.
// Versions are expected as "major.minor.patch" (e.g. "1.6.2").
func isNewer(remote, local string) bool {
	r, rErr := parseSemver(remote)
	l, lErr := parseSemver(local)
	if rErr != nil || lErr != nil {
		return remote != local // fallback to inequality
	}
	for i := 0; i < 3; i++ {
		if r[i] != l[i] {
			return r[i] > l[i]
		}
	}
	return false
}

func parseSemver(s string) ([3]int, error) {
	s = strings.TrimPrefix(s, "v")
	parts := strings.SplitN(s, ".", 3)
	if len(parts) != 3 {
		return [3]int{}, fmt.Errorf("invalid semver: %s", s)
	}
	var v [3]int
	for i, p := range parts {
		n, err := strconv.Atoi(p)
		if err != nil {
			return [3]int{}, err
		}
		v[i] = n
	}
	return v, nil
}
