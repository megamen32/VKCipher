#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PATCH_MARKER = 'VKEncrypt middleware patch v1';
const HERE = path.dirname(fileURLToPath(import.meta.url));

function expandHome(value) {
    return value.startsWith('~/') ? path.join(os.homedir(), value.slice(2)) : value;
}

function packageLooksLikeOpenClawVk(dir) {
    try {
        const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
        return manifest.name === '@openclaw-vk/vk';
    } catch {
        return false;
    }
}

function findPluginDir(explicit) {
    const candidates = [
        explicit,
        process.env.OPENCLAW_VK_PLUGIN_DIR,
        path.join(os.homedir(), '.openclaw', 'extensions', 'vk'),
        path.join(os.homedir(), '.openclaw', 'plugins', 'vk'),
        path.join(process.cwd(), 'node_modules', '@openclaw-vk', 'vk'),
    ].filter(Boolean).map(expandHome);

    return candidates.find(packageLooksLikeOpenClawVk) || null;
}

function backupOnce(filePath) {
    const backupPath = `${filePath}.vkencrypt-original`;
    if (!fs.existsSync(backupPath)) fs.copyFileSync(filePath, backupPath);
    return backupPath;
}

function patchInbound(inboundPath) {
    let source = fs.readFileSync(inboundPath, 'utf8');
    if (source.includes(PATCH_MARKER)) return false;

    const legacyCryptoImport = 'import { decryptMessage, encryptMessage, isEncrypted } from "./crypto.js";\n';
    source = source.replace(legacyCryptoImport, '');

    const importNeedles = [
        'import { DEFAULT_TIMING } from "openclaw/plugin-sdk/channel-feedback";',
        'import { markMessageReadVk, sendPayloadVk, sendTypingVk } from "./send.js";',
    ];
    const importNeedle = importNeedles.find((needle) => source.includes(needle));
    if (!importNeedle) {
        throw new Error('Unsupported @openclaw-vk/vk build: inbound import anchor is missing');
    }
    source = source.replace(
        importNeedle,
        `${importNeedle}\nimport { decryptVkTextForPeer, protectVkOutboundPayload } from "./vkencrypt-runtime.js";`,
    );

    const replyNeedle = `async function deliverVkReply(params) {\n  const result = await sendPayloadVk(String(params.peerId), params.payload, {`;
    const replyReplacement = `async function deliverVkReply(params) {\n  // ${PATCH_MARKER}\n  const protectedPayload = protectVkOutboundPayload({\n    accountId: params.accountId,\n    peerId: params.peerId,\n    payload: params.payload\n  });\n  const result = await sendPayloadVk(String(params.peerId), protectedPayload, {`;
    if (!source.includes(replyNeedle)) {
        throw new Error('Unsupported @openclaw-vk/vk build: reply anchor is missing');
    }
    source = source.replace(replyNeedle, replyReplacement);

    const bodyNeedle = '  const rawBody = payloadCommand ?? visibleBody;';
    const bodyReplacement = `  let rawBody = payloadCommand ?? visibleBody;\n  const decryptedVkBody = decryptVkTextForPeer({\n    accountId: account.accountId,\n    peerId: message.peerId,\n    text: rawBody\n  });\n  if (decryptedVkBody) rawBody = decryptedVkBody.text;`;
    if (source.includes(bodyNeedle)) {
        source = source.replace(bodyNeedle, bodyReplacement);
    } else {
        const legacyBodyNeedle = [
            '  const rawBodyRaw = payloadCommand ?? visibleBody;',
            '  if (!rawBodyRaw) {',
            '    return;',
            '  }',
            '  const decryptedBody = isEncrypted(rawBodyRaw) ? await decryptMessage(rawBodyRaw) : null;',
            '  const rawBody = decryptedBody ?? rawBodyRaw;',
        ].join('\n');
        if (!source.includes(legacyBodyNeedle)) {
            throw new Error('Unsupported @openclaw-vk/vk build: inbound body anchor is missing');
        }
        source = source.replace(legacyBodyNeedle, bodyReplacement);
    }
    const legacyOutboundNeedle = [
        '        if (normalized.text) {',
        '          try {',
        '            normalized.text = await encryptMessage(normalized.text);',
        '          } catch (err) {',
        '            runtime.error?.(`vk: encrypt outbound failed: ${String(err)}`);',
        '          }',
        '        }',
    ].join('\n') + '\n';
    source = source.replace(legacyOutboundNeedle, '');
    if (source.includes('encryptMessage') || source.includes('decryptMessage') || source.includes('./crypto.js')) {
        throw new Error('Unsupported @openclaw-vk/vk build: legacy crypto block was not removed');
    }
    fs.writeFileSync(inboundPath, source, 'utf8');
    return true;
}

export function installOpenClawPatch(pluginDir) {
    const inboundPath = path.join(pluginDir, 'dist', 'src', 'inbound.js');
    if (!fs.existsSync(inboundPath)) {
        throw new Error(`Не найден runtime OpenClaw: ${inboundPath}`);
    }
    if (!packageLooksLikeOpenClawVk(pluginDir)) {
        throw new Error(`Это не @openclaw-vk/vk: ${pluginDir}`);
    }

    const runtimeDir = path.dirname(inboundPath);
    const middlewareTarget = path.join(runtimeDir, 'vkencrypt-middleware.js');
    const runtimeTarget = path.join(runtimeDir, 'vkencrypt-runtime.js');
    const backups = [backupOnce(inboundPath)];
    fs.copyFileSync(path.join(HERE, 'vkencrypt-middleware.mjs'), middlewareTarget);
    fs.copyFileSync(path.join(HERE, 'openclaw-runtime.js'), runtimeTarget);
    const changed = patchInbound(inboundPath);

    return { pluginDir, changed, backups, runtimeTarget, middlewareTarget };
}

function parseArgs(argv) {
    const options = { command: argv[0] || 'install' };
    for (const arg of argv.slice(1)) {
        if (arg.startsWith('--plugin-dir=')) options.pluginDir = expandHome(arg.slice('--plugin-dir='.length));
        else if (arg === '--help' || arg === '-h') options.command = 'help';
        else throw new Error(`Неизвестный аргумент: ${arg}`);
    }
    return options;
}

function printHelp() {
    console.log(`VKEncrypt для @openclaw-vk/vk

1. Положи seed-фразу в ~/.openclaw/vkencrypt.seed (chmod 600).
2. Запусти:
   node bot/node/openclaw-vk-encrypt.mjs install
3. Перезапусти gateway:
   openclaw gateway restart

Можно указать путь к установленному плагину:
   node bot/node/openclaw-vk-encrypt.mjs install --plugin-dir=~/.openclaw/extensions/vk

Среда процесса также поддерживает VK_ENCRYPT_SEED, VK_ENCRYPT_KEY или VK_ENCRYPT_KEY_FILE.
Токен VK не читается и не изменяется.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    try {
        const options = parseArgs(process.argv.slice(2));
        if (options.command === 'help') {
            printHelp();
        } else if (options.command !== 'install') {
            throw new Error('Доступна только команда install');
        } else {
            const pluginDir = findPluginDir(options.pluginDir);
            if (!pluginDir) {
                throw new Error('Не найден установленный @openclaw-vk/vk. Укажи --plugin-dir.');
            }
            const result = installOpenClawPatch(pluginDir);
            console.log(`${result.changed ? '✅ Патч установлен' : 'ℹ️ Патч уже был установлен'}: ${pluginDir}`);
            console.log('🔐 Ответы на расшифрованные сообщения будут отправляться тем же ключом и codec.');
            console.log('Перезапусти gateway: openclaw gateway restart');
        }
    } catch (error) {
        console.error(`❌ ${error.message}`);
        process.exitCode = 1;
    }
}
