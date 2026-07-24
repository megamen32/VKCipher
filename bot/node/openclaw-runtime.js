import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createVkEncryptMiddleware } from './vkencrypt-middleware.js';

const CHANNEL_ID = process.env.VK_ENCRYPT_CHANNEL || 'vk';

function expandHome(value) {
    return value.startsWith('~/') ? path.join(os.homedir(), value.slice(2)) : value;
}

function readSecretFile(filePath) {
    try {
        const value = fs.readFileSync(expandHome(filePath), 'utf8').trim();
        if (/^[0-9a-f]{64}$/iu.test(value)) return { key: value };
        if (value) return { seed: value };
    } catch {
        // A missing secret file keeps this channel disabled.
    }
    return {};
}

function secretFromConfig(entry = {}) {
    if (entry.enabled === false) return {};
    if (entry.key || entry.seed) return { key: entry.key, seed: entry.seed };
    if (entry.keyFile) return readSecretFile(entry.keyFile);
    if (entry.seedFile) return readSecretFile(entry.seedFile);
    if (entry.secretFile) return readSecretFile(entry.secretFile);
    return {};
}

function readConfig() {
    const configPath = expandHome(
        process.env.VK_ENCRYPT_CONFIG_FILE || path.join('~', '.openclaw', 'vkencrypt.json'),
    );
    try {
        return JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } catch {
        return {};
    }
}

function readLegacySecret() {
    const directKey = process.env.VK_ENCRYPT_KEY || process.env.VKENC_KEY;
    const directSeed = process.env.VK_ENCRYPT_SEED || process.env.VKENC_SEED;
    if (directKey || directSeed) return { key: directKey, seed: directSeed };

    const filePath = process.env.VK_ENCRYPT_KEY_FILE || process.env.VK_ENCRYPT_SEED_FILE ||
        path.join(os.homedir(), '.openclaw', 'vkencrypt.seed');
    return readSecretFile(filePath);
}

const config = readConfig();
const channelConfig = config.channels?.[CHANNEL_ID];
const middlewareCache = new Map();

function middlewareForAccount(accountId = 'default') {
    const cacheKey = String(accountId || 'default');
    if (!middlewareCache.has(cacheKey)) {
        const accountConfig = channelConfig?.accounts?.[cacheKey] ||
            channelConfig?.accounts?.default || channelConfig;
        const secret = channelConfig
            ? secretFromConfig(accountConfig)
            : readLegacySecret();
        middlewareCache.set(cacheKey, createVkEncryptMiddleware(secret));
    }
    return middlewareCache.get(cacheKey);
}

export function decryptVkTextForPeer({ accountId, peerId, text }) {
    return middlewareForAccount(accountId).decryptInbound(peerId, text, accountId);
}

export function protectVkOutboundPayload({ accountId, peerId, payload }) {
    return middlewareForAccount(accountId).protectPayload(peerId, payload, accountId);
}
