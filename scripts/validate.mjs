// Project checks with no dependencies, run locally and in CI:
//   node scripts/validate.mjs
//
// - manifest.json is valid JSON and every file it references exists
// - every JavaScript file parses

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_DIRS = ['src', 'scripts', 'tests'];
const errors = [];

function manifestFiles(manifest) {
  return [
    manifest.background?.service_worker,
    manifest.action?.default_popup,
    ...Object.values(manifest.icons ?? {}),
    ...Object.values(manifest.action?.default_icon ?? {}),
  ].filter(Boolean);
}

function checkManifest() {
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'));
  } catch (err) {
    errors.push(`manifest.json: ${err.message}`);
    return;
  }
  for (const key of ['manifest_version', 'name', 'version']) {
    if (!(key in manifest)) errors.push(`manifest.json: missing "${key}"`);
  }
  for (const file of manifestFiles(manifest)) {
    if (!existsSync(join(root, file))) {
      errors.push(`manifest.json: referenced file not found: ${file}`);
    }
  }
}

function javascriptFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return javascriptFiles(path);
    return /\.m?js$/.test(entry.name) ? [path] : [];
  });
}

function checkSyntax() {
  const files = SOURCE_DIRS.flatMap((dir) => javascriptFiles(join(root, dir)));
  for (const file of files) {
    try {
      execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
    } catch (err) {
      errors.push(`${relative(root, file)}: ${err.stderr.toString().trim()}`);
    }
  }
  return files.length;
}

checkManifest();
const checked = checkSyntax();

if (errors.length > 0) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log(`manifest.json is valid; ${checked} JavaScript files parse.`);
