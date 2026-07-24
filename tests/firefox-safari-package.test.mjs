import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('Firefox build creates a signed-ready MV3 zip with Gecko metadata', () => {
    execFileSync('npm', ['run', 'build:firefox'], { cwd: ROOT, stdio: 'pipe' });

    const packageJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    const packageRoot = path.join(ROOT, 'dist', 'firefox', 'package');
    const zipPath = path.join(ROOT, 'dist', 'firefox', `vkencrypt-firefox-v${packageJson.version}.zip`);
    const manifest = JSON.parse(fs.readFileSync(path.join(packageRoot, 'manifest.json'), 'utf8'));
    const archive = execFileSync('unzip', ['-Z1', zipPath], { encoding: 'utf8' });

    assert.equal(manifest.manifest_version, 3);
    assert.equal(manifest.version, packageJson.version);
    assert.equal(manifest.browser_specific_settings.gecko.id, 'vkencrypt@megamen32.github.io');
    assert.match(archive, /^manifest\.json$/mu);
    assert.match(archive, /^vkencrypt\.user\.js$/mu);
});

test('Safari build creates converter-ready source input', () => {
    execFileSync('npm', ['run', 'build:safari-source'], { cwd: ROOT, stdio: 'pipe' });

    const sourceRoot = path.join(ROOT, 'dist', 'safari', 'source');
    const manifest = JSON.parse(fs.readFileSync(path.join(sourceRoot, 'manifest.json'), 'utf8'));

    assert.equal(manifest.name, 'VKEncrypt Safari');
    assert.equal(manifest.version, JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version);
    assert.ok(fs.statSync(path.join(sourceRoot, 'vkencrypt.user.js')).size > 1000);
    assert.match(fs.readFileSync(path.join(sourceRoot, 'SAFARI-BUILD.md'), 'utf8'), /xcrun safari-web-extension-converter/u);
});
