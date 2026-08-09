import assert from 'node:assert/strict';
import { mkdtemp, readFile, stat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const ROOT = new URL('..', import.meta.url).pathname;
const KEY_SCRIPT = join(ROOT, 'scripts', 'hermes-vk-key.sh');
const INSTALL_SCRIPT = join(ROOT, 'scripts', 'install-hermes-vk-plugin.sh');

function run(script, args, { home, input = '' }) {
    return spawnSync('bash', [script, ...args], {
        cwd: ROOT,
        env: { ...process.env, HOME: home, HERMES_HOME: join(home, '.hermes') },
        input,
        encoding: 'utf8',
    });
}

test('Hermes key manager changes seed without exposing it and installs plugin locally', async () => {
    const home = await mkdtemp(join(tmpdir(), 'vkencrypt-hermes-'));
    try {
        const seed = run(KEY_SCRIPT, ['set-seed'], { home, input: 'correct horse battery staple\n' });
        assert.equal(seed.status, 0, seed.stderr);
        assert.equal(await readFile(join(home, '.hermes', 'vkencrypt-vk.seed'), 'utf8'), 'correct horse battery staple\n');
        assert.equal((await stat(join(home, '.hermes', 'vkencrypt-vk.seed'))).mode & 0o777, 0o600);
        assert.match(await readFile(join(home, '.hermes', '.env'), 'utf8'), /^VK_ENCRYPT_SEED_FILE=~\/\.hermes\/vkencrypt-vk\.seed$/m);
        assert.doesNotMatch(seed.stdout + seed.stderr, /correct horse battery staple/u);

        const directKey = '0123456789abcdef'.repeat(4);
        const key = run(KEY_SCRIPT, ['set-key'], { home, input: `${directKey}\n` });
        assert.equal(key.status, 0, key.stderr);
        assert.equal(await readFile(join(home, '.hermes', 'vkencrypt.key'), 'utf8'), `${directKey}\n`);
        assert.match(await readFile(join(home, '.hermes', '.env'), 'utf8'), /^VK_ENCRYPT_KEY_FILE=~\/\.hermes\/vkencrypt\.key$/m);
        assert.doesNotMatch(key.stdout + key.stderr, new RegExp(directKey, 'u'));

        const install = run(INSTALL_SCRIPT, [], { home });
        assert.equal(install.status, 0, install.stderr);
        assert.equal(await stat(join(home, '.hermes', 'plugins', 'vk', 'plugin.yaml')).then(() => true), true);
    } finally {
        await rm(home, { recursive: true, force: true });
    }
});
