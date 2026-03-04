# Xyzen Version Management System

This document describes the fully automated version management system for Xyzen using **semantic-release**.

## Overview

Xyzen uses **Conventional Commits** + **semantic-release** to achieve:

- 🤖 **Fully automated** version bumping based on commit messages
- 📝 **Auto-generated** CHANGELOG.md
- 🏷️ **Automatic** Git tags and GitHub releases
- 🔄 **Synchronized** frontend (`package.json`) and backend (`pyproject.toml`) versions
- 🚀 **Automatic** Docker builds and deployments

## Workflow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        AUTOMATED RELEASE WORKFLOW                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  1️⃣ Developer creates feature branch                                         │
│     $ git checkout -b feature/new-login                                      │
│     $ git commit -m "feat(auth): add OAuth2 login"                          │
│                                                                              │
│  2️⃣ Create PR and merge to main                                              │
│     (Commitlint validates commit message format)                             │
│                                                                              │
│  3️⃣ semantic-release analyzes commits                                        │
│     ┌─────────────────────────────────────────┐                             │
│     │ Commits since last release:             │                             │
│     │   - feat(auth): add OAuth2 login        │                             │
│     │   - fix(ui): button alignment           │                             │
│     │                                         │                             │
│     │ Decision: feat → MINOR version bump     │                             │
│     │ Version: 1.2.0 → 1.3.0                  │                             │
│     └─────────────────────────────────────────┘                             │
│                                                                              │
│  4️⃣ Automatic actions:                                                       │
│     ✅ Update web/package.json      → version: "1.3.0"                       │
│     ✅ Update service/pyproject.toml → version = "1.3.0"                     │
│     ✅ Generate CHANGELOG.md                                                 │
│     ✅ Create Git commit: "chore(release): 1.3.0 [skip ci]"                  │
│     ✅ Create Git tag: v1.3.0                                                │
│     ✅ Create GitHub Release with notes                                      │
│                                                                              │
│  5️⃣ Build & Deploy job triggers:                                             │
│     ✅ Build Docker images with version tags                                 │
│     ✅ Push to registry.sciol.ac.cn                                          │
│     ✅ Deploy to Kubernetes clusters                                         │
│                                                                              │
│  🎉 Done! No manual intervention required                                    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Commit Message Format

We use [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

### Types and Their Effects

| Type       | Version Bump | Description                | Example                            |
| ---------- | ------------ | -------------------------- | ---------------------------------- |
| `feat`     | **MINOR**    | New feature                | `feat(auth): add SSO login`        |
| `fix`      | **PATCH**    | Bug fix                    | `fix(chat): message ordering`      |
| `perf`     | **PATCH**    | Performance improvement    | `perf(api): optimize query`        |
| `refactor` | **PATCH**    | Code refactoring           | `refactor(core): simplify handler` |
| `docs`     | None         | Documentation only         | `docs: update README`              |
| `style`    | None         | Formatting, no code change | `style: fix indentation`           |
| `test`     | None         | Adding or fixing tests     | `test: add unit tests`             |
| `chore`    | None         | Maintenance                | `chore: update dependencies`       |
| `ci`       | None         | CI/CD changes              | `ci: add caching`                  |
| `build`    | None         | Build system changes       | `build: update vite config`        |

### Breaking Changes → MAJOR

Add `!` after type or `BREAKING CHANGE:` in footer:

```bash
# Method 1: Add ! after type
feat(api)!: change authentication flow

# Method 2: Add BREAKING CHANGE in footer
feat(api): change authentication flow

BREAKING CHANGE: The login endpoint now requires OAuth2 tokens
```

## Quick Start

### Setup (One Time)

```bash
# Install dependencies at repo root
yarn install

# Setup husky hooks (auto-runs on install)
yarn husky install
```

### Daily Development

```bash
# Create feature branch
git checkout -b feature/my-feature

# Make changes and commit with conventional format
git commit -m "feat(module): add new feature"

# Push and create PR
git push origin feature/my-feature
```

### Interactive Commit (Optional)

```bash
# Use commitizen for guided commit message
yarn commit
```

## File Structure

```
Xyzen/
├── .releaserc.json              # semantic-release configuration
├── commitlint.config.mjs        # Commit message linting rules
├── package.json                 # Root package with release deps
├── scripts/
│   └── sync-version.mjs         # Syncs version to pyproject.toml
├── .github/workflows/
│   └── release.yaml             # CI/CD pipeline
├── CHANGELOG.md                 # Auto-generated changelog
├── service/
│   └── pyproject.toml           # Backend version (auto-updated)
└── web/
    └── package.json             # Frontend version (auto-updated)
```

## Version Display

The Settings → About page shows:

- **Frontend version**: Read from `package.json` at build time via Vite
- **Backend version**: Read from `pyproject.toml` at runtime via API
- **Version status**: Match/mismatch indicator with troubleshooting tips

### API Endpoint

```http
GET /xyzen/api/v1/system/version
```

Response:

```json
{
  "version": "1.3.0",
  "commit": "abc1234",
  "build_time": "2026-01-21T12:00:00Z",
  "backend": "fastapi"
}
```

## CI/CD Pipeline

The release workflow (`.github/workflows/release.yaml`) runs on every push to `main`:

```yaml
Jobs:
  1. release         # Run semantic-release
  2. build-and-deploy # Build Docker images & deploy (if new version)
  3. notify          # Send notification email
```

### Docker Image Tags

When version `1.3.0` is released:

```
registry.sciol.ac.cn/sciol/xyzen-service:latest
registry.sciol.ac.cn/sciol/xyzen-service:1.3.0
registry.sciol.ac.cn/sciol/xyzen-service:v1.3.0

registry.sciol.ac.cn/sciol/xyzen-web:latest
registry.sciol.ac.cn/sciol/xyzen-web:1.3.0
registry.sciol.ac.cn/sciol/xyzen-web:v1.3.0
```

## Troubleshooting

### No Release Created

1. Check commit messages follow conventional format
2. Ensure commits include `feat:`, `fix:`, or other release-triggering types
3. Commits like `docs:`, `chore:`, `ci:` don't trigger releases

### Version Mismatch in UI

1. Clear browser cache (PWA may cache old frontend)
2. Hard refresh: `Ctrl+Shift+R` / `Cmd+Shift+R`
3. Check if both services are running the latest deployment

### Commit Message Rejected

```bash
# Your commit was rejected by commitlint
# Fix: Follow the conventional commit format

# Wrong
git commit -m "added new feature"

# Correct
git commit -m "feat: add new feature"
```

## Configuration Files

### `.releaserc.json`

Main semantic-release configuration:

- Commit analysis rules
- Changelog generation
- npm package update (frontend)
- Custom script to sync backend version
- Git commit and tag creation
- GitHub release creation

### `commitlint.config.mjs`

Validates commit messages on pre-commit hook.

### `scripts/sync-version.mjs`

Synchronizes version from `package.json` to `pyproject.toml` during release.

## Manual Release (Emergency)

If you need to manually trigger a release:

```bash
# Dry run (see what would happen)
yarn release:dry

# Actual release (requires GITHUB_TOKEN)
GITHUB_TOKEN=your_token yarn release
```

## Migration from Old System

The old `launch/release.sh` script is no longer needed.

Old workflow:

```
Manual: edit version → commit → tag → push → CI builds
```

New workflow:

```
Auto: commit with conventional message → merge PR → everything else is automatic
```
