/**
 * Reads apps/android/app/build.gradle and writes version.json + a release body for the
 * GitHub Release that hosts the XCron CV sideload APK (same shape as X Cron Jobs' manifest,
 * so the X Cron portal and app can read both the same way).
 *
 * Usage: node scripts/apk-release-manifest.mjs [--out dir] [--notes "text"] [--repo tharikn/xcroncv] [--tag v1.0.0]
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const arg = (flag, fallback = '') => {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const outDir = resolve(root, arg('--out', 'dist-apk-release'));
const repo = arg('--repo', 'tharikn/xcroncv');
const notes = arg('--notes', process.env.APK_NOTES || '');
const gradle = readFileSync(join(root, 'apps', 'android', 'app', 'build.gradle'), 'utf8');
const code = gradle.match(/versionCode\s+(\d+)/);
const name = gradle.match(/versionName\s+"([^"]+)"/);
if (!code || !name) {
  console.error('Could not read versionCode/versionName from apps/android/app/build.gradle');
  process.exit(1);
}
const versionCode = Number(code[1]);
const versionName = name[1];
const tag = arg('--tag', `v${versionName}`);
const apkUrl = `https://github.com/${repo}/releases/download/${tag}/xcron-cv.apk`;

const manifest = {
  versionCode,
  versionName,
  apkUrl,
  minVersionCode: 1,
  releasedAt: new Date().toISOString(),
  notes: notes || `XCron CV ${versionName}`,
  tag,
  repo,
};

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'version.json'), `${JSON.stringify(manifest, null, 2)}\n`);
writeFileSync(
  join(outDir, 'release-body.md'),
  [
    '```xcron-manifest',
    JSON.stringify(manifest),
    '```',
    '',
    '## Release notes',
    '',
    notes.trim() || `Android sideload build **${versionName}** (versionCode ${versionCode}).`,
    '',
    `Download: [${tag} APK](${apkUrl})`,
    '',
  ].join('\n'),
);
writeFileSync(
  join(outDir, 'release-meta.env'),
  `VERSION_CODE=${versionCode}\nVERSION_NAME=${versionName}\nRELEASE_TAG=${tag}\n`,
);
console.log(`tag=${tag} versionCode=${versionCode} versionName=${versionName}`);
