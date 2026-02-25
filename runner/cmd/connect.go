package cmd

import (
	"fmt"
	"os"
	"os/signal"
	"syscall"

	"github.com/scienceol/xyzen/runner/internal/client"
	"github.com/scienceol/xyzen/runner/internal/config"
	"github.com/scienceol/xyzen/runner/internal/ui"
	"github.com/scienceol/xyzen/runner/internal/updater"
	"github.com/spf13/cobra"
)

var (
	flagToken   string
	flagURL     string
	flagWorkDir string
)

func init() {
	connectCmd.Flags().StringVar(&flagToken, "token", "", "Runner authentication token")
	connectCmd.Flags().StringVar(&flagURL, "url", "", "WebSocket URL (e.g. wss://cloud.example.com/xyzen/ws/v1/runner)")
	connectCmd.Flags().StringVar(&flagWorkDir, "work-dir", "", "Working directory for file operations (default: current directory)")
	rootCmd.AddCommand(connectCmd)
}

var connectCmd = &cobra.Command{
	Use:   "connect",
	Short: "Connect this machine as a runner to the Xyzen cloud",
	Long: `Establishes a persistent WebSocket connection to the Xyzen backend.
Once connected, AI agents can execute commands and access files in the
configured working directory.

The connection automatically reconnects with exponential backoff if interrupted.`,
	RunE: func(cmd *cobra.Command, args []string) error {
		ui.Banner(version)

		// Check for updates (best-effort)
		if info := updater.CheckForUpdate(version); info != nil {
			curl := fmt.Sprintf("sudo curl -fsSL %s -o /usr/local/bin/xyzen && sudo chmod +x /usr/local/bin/xyzen", info.DownloadURL)
			ui.UpdateNotice(version, info.Latest, curl)
		}

		cfg, err := config.Load(flagToken, flagURL, flagWorkDir)
		if err != nil {
			return fmt.Errorf("configuration error: %w", err)
		}

		fmt.Fprintln(os.Stderr)
		ui.KeyValue("Endpoint", cfg.URL)
		ui.KeyValue("Work dir", cfg.WorkDir)
		ui.Separator()
		ui.Info("Waiting for connection...")

		c := client.New(cfg)

		// Handle graceful shutdown
		sigCh := make(chan os.Signal, 1)
		signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)

		go func() {
			<-sigCh
			fmt.Fprintln(os.Stderr)
			ui.Warn("Shutting down...")
			c.Stop()
		}()

		return c.Run()
	},
}
