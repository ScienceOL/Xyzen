/**
 * Sync version to service/pyproject.toml
 * Used by semantic-release via @semantic-release/exec
 */

import { readFileSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = resolve(__dirname, '..');

const version = process.argv[2];

if (!version) {
  console.error('❌ No version provided');
  process.exit(1);
}

console.log(`📦 Syncing version ${version} to all packages...`);

// Update service/pyproject.toml
const pyprojectPath = resolve(ROOT_DIR, 'service/pyproject.toml');
let pyprojectContent = readFileSync(pyprojectPath, 'utf-8');
pyprojectContent = pyprojectContent.replace(
  /^version\s*=\s*"[^"]*"/m,
  `version = "${version}"`
);
writeFileSync(pyprojectPath, pyprojectContent);
console.log(`  ✅ Updated service/pyproject.toml → ${version}`);

console.log('🎉 Version sync complete!');
