import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const baseManifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'extension', 'chrome', 'manifest.json'), 'utf8'));
const version = packageJson.version;
const sourceRoot = path.join(ROOT, 'dist', 'safari', 'source');

fs.rmSync(sourceRoot, { recursive: true, force: true });
fs.mkdirSync(sourceRoot, { recursive: true });

const manifest = {
    ...baseManifest,
    version,
    name: 'VKEncrypt Safari',
    description: 'P2P encryption for VK, Max and Telegram Web',
};

fs.writeFileSync(path.join(sourceRoot, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
fs.copyFileSync(
    path.join(ROOT, 'extension', 'vkencrypt.user.js'),
    path.join(sourceRoot, 'vkencrypt.user.js'),
);
fs.writeFileSync(
    path.join(sourceRoot, 'SAFARI-BUILD.md'),
    '# Safari build input\n\nThis directory is passed to `xcrun safari-web-extension-converter` on macOS.\n',
);

console.log(`Built Safari Web Extension source: ${sourceRoot}`);
