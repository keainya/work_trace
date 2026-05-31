package utils

import (
	"fmt"
	"os"
	"path/filepath"
)

// pidFilePath is set by WritePidFile so RemovePidFile knows which file to clean.
var pidFilePath string

// WritePidFile writes the current process PID into "app.pid" next to the binary.
// On success it returns the absolute path, which can later be passed to RemovePidFile.
func WritePidFile() (string, error) {
	exe, err := os.Executable()
	if err != nil {
		return "", fmt.Errorf("os.Executable: %w", err)
	}
	dir := filepath.Dir(exe)
	path := filepath.Join(dir, "app.pid")
	if err := os.WriteFile(path, []byte(fmt.Sprintf("%d", os.Getpid())), 0644); err != nil {
		return "", fmt.Errorf("write pid file: %w", err)
	}
	pidFilePath = path
	return path, nil
}

// RemovePidFile deletes the pid file created by WritePidFile.
// Safe to call even if the file was never created (no-op).
func RemovePidFile() {
	if pidFilePath != "" {
		os.Remove(pidFilePath)
	}
}
