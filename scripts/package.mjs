// Builds the file users download from a release:
//   node scripts/package.mjs [version]
//
// - with a version, writes it to manifest.json first (the release workflow
//   passes the version computed by semantic-release)
// - copies what Chrome needs to dist/tab-audio-recorder/
// - zips that folder to dist/tab-audio-recorder.zip
//
// Requires the `zip` command.

import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PACKAGE_NAME = 'tab-audio-recorder';
const PACKAGED_PATHS = ['manifest.json', 'icons', 'src', 'LICENSE', 'NOTICE'];
// Chrome accepts one to four dot-separated integers, so no pre-release suffix.
const CHROME_VERSION = /^\d+(\.\d+){0,3}$/;
const MANIFEST_VERSION = /"version":\s*"[^"]*"/;

/** Replaces the version in place, to keep the layout of the manifest. */
function setManifestVersion(version) {
  if (!CHROME_VERSION.test(version)) {
    throw new Error(`"${version}" is not a version Chrome accepts.`);
  }
  const path = join(root, 'manifest.json');
  const manifest = readFileSync(path, 'utf8');
  if (!MANIFEST_VERSION.test(manifest)) {
    throw new Error('manifest.json has no "version" to replace.');
  }
  writeFileSync(path, manifest.replace(MANIFEST_VERSION, `"version": "${version}"`));
}

function buildArchive() {
  const dist = join(root, 'dist');
  const staging = join(dist, PACKAGE_NAME);
  rmSync(dist, { recursive: true, force: true });
  mkdirSync(staging, { recursive: true });
  for (const path of PACKAGED_PATHS) {
    cpSync(join(root, path), join(staging, path), { recursive: true });
  }
  // The archive holds one folder, which the user selects with "Load unpacked".
  const archive = `${PACKAGE_NAME}.zip`;
  execFileSync('zip', ['-r', '-X', '-q', archive, PACKAGE_NAME], { cwd: dist });
  return join('dist', archive);
}

const [version] = process.argv.slice(2);
if (version) setManifestVersion(version);
console.log(`Packaged ${buildArchive()}.`);
