import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const baseManifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'extension', 'chrome', 'manifest.json'), 'utf8'));
const version = packageJson.version;

if (!/^\d+(\.\d+){1,3}$/u.test(version)) {
    throw new Error(`Firefox manifest version is invalid: ${version}`);
}

const manifest = {
    ...baseManifest,
    version,
    browser_specific_settings: {
        gecko: {
            id: 'vkencrypt@megamen32.github.io',
            strict_min_version: '121.0',
        },
    },
};

const outputRoot = path.join(ROOT, 'dist', 'firefox');
const packageRoot = path.join(outputRoot, 'package');
const zipPath = path.join(outputRoot, `vkencrypt-firefox-v${version}.zip`);
const userscriptPath = path.join(ROOT, 'extension', 'vkencrypt.user.js');

fs.rmSync(packageRoot, { recursive: true, force: true });
fs.mkdirSync(packageRoot, { recursive: true });
fs.writeFileSync(path.join(packageRoot, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
fs.copyFileSync(userscriptPath, path.join(packageRoot, 'vkencrypt.user.js'));
fs.rmSync(zipPath, { force: true });
execFileSync('zip', ['-q', '-r', zipPath, 'manifest.json', 'vkencrypt.user.js'], {
    cwd: packageRoot,
    stdio: 'inherit',
});

console.log(`Built Firefox package: ${zipPath}`);
