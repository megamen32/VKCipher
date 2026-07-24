import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('Chrome build creates a valid MV3 zip around the userscript', () => {
    execFileSync('npm', ['run', 'build:chrome'], { cwd: ROOT, stdio: 'pipe' });

    const packageJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    const packageRoot = path.join(ROOT, 'dist', 'chrome', 'package');
    const zipPath = path.join(ROOT, 'dist', 'chrome', `vkencrypt-chrome-v${packageJson.version}.zip`);
    const manifest = JSON.parse(fs.readFileSync(path.join(packageRoot, 'manifest.json'), 'utf8'));
    const archive = execFileSync('unzip', ['-Z1', zipPath], { encoding: 'utf8' });

    assert.equal(manifest.manifest_version, 3);
    assert.equal(manifest.version, packageJson.version);
    assert.deepEqual(manifest.content_scripts[0].js, ['vkencrypt.user.js']);
    assert.match(manifest.content_scripts[0].matches.join('\n'), /vk\.ru/u);
    assert.match(archive, /^manifest\.json$/mu);
    assert.match(archive, /^vkencrypt\.user\.js$/mu);
    assert.ok(fs.statSync(path.join(packageRoot, 'vkencrypt.user.js')).size > 1000);
});
