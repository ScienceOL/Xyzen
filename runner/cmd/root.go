package cmd

import (
	"fmt"
	"os"

	"github.com/spf13/cobra"
)

var rootCmd = &cobra.Command{
	Use:   "xyzen",
	Short: "Xyzen Runner — connect your local machine as a sandbox for AI agents",
	Long: `Xyzen Runner connects your local development environment to the Xyzen cloud,
allowing AI agents to execute commands and access files on your machine.

Similar to GitHub Actions self-hosted runners, this CLI initiates a WebSocket
connection to the Xyzen backend. No public IP or open ports are required.`,
}

func Execute() {
	if err := rootCmd.Execute(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
