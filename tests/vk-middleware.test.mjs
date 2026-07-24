import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

import {
    createVkEncryptMiddleware,
    decryptText,
    deriveKeysFromSeed,
    encryptText,
} from '../bot/node/vkencrypt-middleware.mjs';
import { installOpenClawPatch } from '../bot/node/openclaw-vk-encrypt.mjs';

const SEED = 'test-only shared phrase for VKEncrypt';

test('seed derivation is deterministic and yields four AES keys', () => {
    const first = deriveKeysFromSeed(SEED);
    const second = deriveKeysFromSeed(SEED);

    assert.deepEqual(first, second);
    assert.deepEqual(Object.keys(first), ['k1', 'k2', 'k3', 'k4']);
    for (const key of Object.values(first)) assert.match(key, /^[0-9a-f]{64}$/u);
});

test('v5.4 text round-trips in every supported codec', () => {
    const keys = deriveKeysFromSeed(SEED);
    for (const codec of ['emoji', 'base64', 'cyrillic']) {
        const encrypted = encryptText('Привет, emoji 😀', keys.k1, 'k1', codec);
        const decrypted = decryptText(encrypted, keys);

        assert.equal(decrypted?.text, 'Привет, emoji 😀');
        assert.equal(decrypted?.keyId, 'k1');
        assert.equal(decrypted?.codec, codec);
    }
});

test('middleware remembers the inbound key and codec for the reply peer', async () => {
    const keys = deriveKeysFromSeed(SEED);
    const middleware = createVkEncryptMiddleware({ seed: SEED });
    const inbound = encryptText('входящее', keys.k2, 'k2', 'emoji');

    const decrypted = middleware.decryptInbound(42, inbound, 'account-a');
    assert.equal(decrypted?.text, 'входящее');
    assert.equal(decrypted?.keyId, 'k2');
    assert.equal(decrypted?.codec, 'emoji');

    const outbound = middleware.encryptOutbound(42, 'ответ', 'account-a');
    assert.equal(decryptText(outbound, keys)?.text, 'ответ');
    assert.equal(decryptText(outbound, keys)?.codec, 'emoji');
});

test('vk-io wrapper decrypts inbound events and encrypts messages.send', async () => {
    const keys = deriveKeysFromSeed(SEED);
    const middleware = createVkEncryptMiddleware({ seed: SEED });
    const listeners = new Map();
    let sent;
    const vk = {
        api: {
            messages: {
                send: async (params) => {
                    sent = params;
                    return 1;
                },
            },
        },
        updates: { on: (event, handler) => listeners.set(event, handler) },
    };
    middleware.wrapVkIo(vk);

    const context = { peerId: 77, text: encryptText('привет бот', keys.k1, 'k1', 'cyrillic') };
    listeners.get('message_new')(context);
    assert.equal(context.text, 'привет бот');
    assert.equal(context.vkencrypt.codec, 'cyrillic');

    await vk.api.messages.send({ peer_id: 77, message: 'ответ бота' });
    assert.equal(decryptText(sent.message, keys)?.text, 'ответ бота');
});

test('OpenClaw installer patches only the VK plugin and is idempotent', () => {
    const pluginDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vkencrypt-openclaw-'));
    const sourceDir = path.join(pluginDir, 'dist', 'src');
    fs.mkdirSync(sourceDir, { recursive: true });
    fs.writeFileSync(path.join(pluginDir, 'package.json'), JSON.stringify({ name: '@openclaw-vk/vk' }));
    const inboundPath = path.join(sourceDir, 'inbound.js');
    fs.writeFileSync(inboundPath, `import { DEFAULT_TIMING } from "openclaw/plugin-sdk/channel-feedback";
async function deliverVkReply(params) {
  const result = await sendPayloadVk(String(params.peerId), params.payload, {
    accountId: params.accountId
  });
}
function body(account, message, payloadCommand, visibleBody) {
  const rawBody = payloadCommand ?? visibleBody;
  return rawBody;
}
`);

    try {
        const first = installOpenClawPatch(pluginDir);
        const patched = fs.readFileSync(inboundPath, 'utf8');
        const second = installOpenClawPatch(pluginDir);

        assert.equal(first.changed, true);
        assert.equal(second.changed, false);
        assert.match(patched, /VKEncrypt middleware patch v1/u);
        assert.match(patched, /decryptVkTextForPeer/u);
        assert.match(patched, /protectVkOutboundPayload/u);
        assert.ok(fs.existsSync(`${inboundPath}.vkencrypt-original`));
        assert.ok(fs.existsSync(path.join(sourceDir, 'vkencrypt-runtime.js')));
        assert.ok(fs.existsSync(path.join(sourceDir, 'vkencrypt-middleware.js')));
    } finally {
        fs.rmSync(pluginDir, { recursive: true, force: true });
    }
});

test('OpenClaw installer replaces the older VK legacy crypto build', () => {
    const pluginDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vkencrypt-openclaw-legacy-'));
    const sourceDir = path.join(pluginDir, 'dist', 'src');
    fs.mkdirSync(sourceDir, { recursive: true });
    fs.writeFileSync(path.join(pluginDir, 'package.json'), JSON.stringify({ name: '@openclaw-vk/vk' }));
    const inboundPath = path.join(sourceDir, 'inbound.js');
    fs.writeFileSync(inboundPath, `import { decryptMessage, encryptMessage, isEncrypted } from "./crypto.js";
import { markMessageReadVk, sendPayloadVk, sendTypingVk } from "./send.js";
async function deliverVkReply(params) {
  const result = await sendPayloadVk(String(params.peerId), params.payload, {
    accountId: params.accountId
  });
}
async function handleVkInbound(params) {
  const { message, account, runtime } = params;
  const payloadCommand = null;
  const visibleBody = message.text;
  const rawBodyRaw = payloadCommand ?? visibleBody;
  if (!rawBodyRaw) {
    return;
  }
  const decryptedBody = isEncrypted(rawBodyRaw) ? await decryptMessage(rawBodyRaw) : null;
  const rawBody = decryptedBody ?? rawBodyRaw;
  const normalized = { text: rawBody };
        if (normalized.text) {
          try {
            normalized.text = await encryptMessage(normalized.text);
          } catch (err) {
            runtime.error?.(\`vk: encrypt outbound failed: \${String(err)}\`);
          }
        }
  return rawBody;
}
`);

    try {
        const result = installOpenClawPatch(pluginDir);
        const patched = fs.readFileSync(inboundPath, 'utf8');

        assert.equal(result.changed, true);
        assert.match(patched, /VKEncrypt middleware patch v1/u);
        assert.doesNotMatch(patched, /crypto\.js|encryptMessage|decryptMessage|isEncrypted/u);
        assert.match(patched, /decryptVkTextForPeer/u);
        assert.match(patched, /protectVkOutboundPayload/u);
    } finally {
        fs.rmSync(pluginDir, { recursive: true, force: true });
    }
});

test('OpenClaw runtime isolates keys by VK account', async () => {
    const runtimeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vkencrypt-runtime-'));
    const seedAPath = path.join(runtimeDir, 'account-a.seed');
    const seedBPath = path.join(runtimeDir, 'account-b.seed');
    const configPath = path.join(runtimeDir, 'vkencrypt.json');
    const runtimePath = path.join(runtimeDir, 'openclaw-runtime.js');
    const middlewarePath = path.join(runtimeDir, 'vkencrypt-middleware.js');
    const envNames = ['VK_ENCRYPT_CONFIG_FILE', 'VK_ENCRYPT_CHANNEL', 'VK_ENCRYPT_SEED', 'VK_ENCRYPT_KEY'];
    const previousEnv = Object.fromEntries(envNames.map((name) => [name, process.env[name]]));

    fs.writeFileSync(seedAPath, 'account-a shared phrase');
    fs.writeFileSync(seedBPath, 'account-b shared phrase');
    fs.writeFileSync(configPath, JSON.stringify({
        channels: {
            vk: {
                accounts: {
                    alpha: { seedFile: seedAPath },
                    beta: { seedFile: seedBPath },
                },
            },
        },
    }));
    fs.writeFileSync(path.join(runtimeDir, 'package.json'), JSON.stringify({ type: 'module' }));
    fs.copyFileSync(new URL('../bot/node/openclaw-runtime.js', import.meta.url), runtimePath);
    fs.copyFileSync(new URL('../bot/node/vkencrypt-middleware.mjs', import.meta.url), middlewarePath);

    try {
        process.env.VK_ENCRYPT_CONFIG_FILE = configPath;
        process.env.VK_ENCRYPT_CHANNEL = 'vk';
        delete process.env.VK_ENCRYPT_SEED;
        delete process.env.VK_ENCRYPT_KEY;
        const runtime = await import(`${pathToFileURL(runtimePath).href}?test=${Date.now()}`);
        const keysA = deriveKeysFromSeed('account-a shared phrase');
        const keysB = deriveKeysFromSeed('account-b shared phrase');
        const inboundA = encryptText('для alpha', keysA.k1, 'k1', 'emoji');
        const inboundB = encryptText('для beta', keysB.k1, 'k1', 'emoji');

        assert.equal(runtime.decryptVkTextForPeer({ accountId: 'alpha', peerId: 1, text: inboundA })?.text, 'для alpha');
        assert.equal(runtime.decryptVkTextForPeer({ accountId: 'beta', peerId: 1, text: inboundB })?.text, 'для beta');
        const outboundA = runtime.protectVkOutboundPayload({
            accountId: 'alpha',
            peerId: 1,
            payload: { text: 'ответ alpha' },
        });
        const outboundB = runtime.protectVkOutboundPayload({
            accountId: 'beta',
            peerId: 1,
            payload: { text: 'ответ beta' },
        });
        assert.equal(decryptText(outboundA.text, keysA)?.text, 'ответ alpha');
        assert.equal(decryptText(outboundB.text, keysB)?.text, 'ответ beta');
        assert.throws(() => decryptText(outboundA.text, keysB), /authenticate data/u);
    } finally {
        for (const name of envNames) {
            if (previousEnv[name] === undefined) delete process.env[name];
            else process.env[name] = previousEnv[name];
        }
        fs.rmSync(runtimeDir, { recursive: true, force: true });
    }
});
