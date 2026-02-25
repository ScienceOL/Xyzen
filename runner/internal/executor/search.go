package executor

import (
	"bufio"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	"github.com/scienceol/xyzen/runner/internal/protocol"
)

const (
	maxFindResults   = 1000
	maxSearchResults = 200
)

// FindFiles walks a directory tree and returns paths matching a glob pattern.
func (e *Executor) FindFiles(root, pattern string) ([]string, error) {
	resolved, err := e.resolvePath(root)
	if err != nil {
		return nil, err
	}

	var results []string
	err = filepath.WalkDir(resolved, func(path string, d os.DirEntry, err error) error {
		if err != nil {
			return nil // Skip inaccessible paths
		}
		if len(results) >= maxFindResults {
			return filepath.SkipAll
		}
		if d.IsDir() {
			return nil
		}

		matched, matchErr := filepath.Match(pattern, d.Name())
		if matchErr != nil {
			return nil
		}
		if matched {
			// Return path relative to root
			rel, relErr := filepath.Rel(resolved, path)
			if relErr != nil {
				rel = path
			}
			results = append(results, filepath.Join(root, rel))
		}
		return nil
	})
	if err != nil {
		return nil, fmt.Errorf("find files: %w", err)
	}
	return results, nil
}

// SearchInFiles searches file contents for a regex pattern.
func (e *Executor) SearchInFiles(root, pattern, include string) ([]protocol.SearchMatchResult, error) {
	resolved, err := e.resolvePath(root)
	if err != nil {
		return nil, err
	}

	re, err := regexp.Compile(pattern)
	if err != nil {
		return nil, fmt.Errorf("invalid regex: %w", err)
	}

	var results []protocol.SearchMatchResult
	err = filepath.WalkDir(resolved, func(path string, d os.DirEntry, walkErr error) error {
		if walkErr != nil {
			return nil
		}
		if len(results) >= maxSearchResults {
			return filepath.SkipAll
		}
		if d.IsDir() {
			return nil
		}

		// Apply include filter (glob on filename)
		if include != "" {
			matched, matchErr := filepath.Match(include, d.Name())
			if matchErr != nil || !matched {
				return nil
			}
		}

		// Skip binary/large files
		info, infoErr := d.Info()
		if infoErr != nil || info.Size() > 10*1024*1024 { // Skip >10MB
			return nil
		}

		matches := searchFile(path, re, root, resolved)
		results = append(results, matches...)
		return nil
	})
	if err != nil {
		return nil, fmt.Errorf("search in files: %w", err)
	}
	return results, nil
}

func searchFile(path string, re *regexp.Regexp, logicalRoot, resolvedRoot string) []protocol.SearchMatchResult {
	f, err := os.Open(path)
	if err != nil {
		return nil
	}
	defer f.Close()

	var results []protocol.SearchMatchResult
	scanner := bufio.NewScanner(f)
	lineNum := 0
	for scanner.Scan() {
		lineNum++
		line := scanner.Text()
		if re.MatchString(line) {
			// Build path relative to root
			rel, relErr := filepath.Rel(resolvedRoot, path)
			filePath := path
			if relErr == nil {
				filePath = filepath.Join(logicalRoot, rel)
			}

			results = append(results, protocol.SearchMatchResult{
				File:    filePath,
				Line:    lineNum,
				Content: truncate(strings.TrimSpace(line), 500),
			})
		}
	}
	return results
}

func truncate(s string, max int) string {
	if len(s) <= max {
		return s
	}
	return s[:max] + "..."
}
