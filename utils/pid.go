package utils

import (
	"fmt"
	"os"
	"path/filepath"
)

// pidFilePath is set by WritePidFile so RemovePidFile knows which file to clean.
var pidFilePath string

// WritePidFile writes the current process PID into "app.pid".
// Tries binary directory first, falls back to working directory.
func WritePidFile() (string, error) {
	candidates := []string{}
	if exe, e := os.Executable(); e == nil {
		candidates = append(candidates, filepath.Join(filepath.Dir(exe), "app.pid"))
	}
	if cwd, e := os.Getwd(); e == nil {
		candidates = append(candidates, filepath.Join(cwd, "app.pid"))
	}

	var writeErr error
	for _, p := range candidates {
		writeErr = os.WriteFile(p, []byte(fmt.Sprintf("%d", os.Getpid())), 0644)
		if writeErr == nil {
			pidFilePath = p
			return p, nil
		}
	}
	if len(candidates) == 0 {
		return "", fmt.Errorf("no candidate paths")
	}
	return "", fmt.Errorf("write app.pid failed: %w", writeErr)
}

// RemovePidFile deletes the pid file created by WritePidFile.
// Safe to call even if the file was never created (no-op).
func RemovePidFile() {
	if pidFilePath != "" {
		os.Remove(pidFilePath)
	}
}
