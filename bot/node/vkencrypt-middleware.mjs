import { createDecipheriv, createCipheriv, pbkdf2Sync, randomBytes } from 'node:crypto';

export const FORMAT_START = '𓁗';
export const FORMAT_MID = 'Ⰴ';
export const FORMAT_PAYLOAD = 'Ⱑ';
export const KDF_SALT = 'vk-p2p-aes-gcm-v1';
export const KDF_ITERATIONS = 250_000;

const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const EMOJI_ALPHABET = [
    '😀','😁','😂','🤣','😃','😄','😅','😆',
    '😉','😊','😋','😎','😍','😘','🥰','😗',
    '😙','😚','🙂','🤗','🤩','🤔','🤨','😐',
    '😑','😶','🙄','😏','😣','😥','😮','🤐',
    '😯','😪','😫','🥱','😴','😌','😛','😜',
    '😝','🤤','😒','😓','😔','😕','🙃','🤑',
    '😲','😡','🤬','😖','😞','😟','😤','😢',
    '😭','😦','😧','😨','😩','🤯','😬','😰',
];
const CYRILLIC_ALPHABET = [
    'А','Б','В','Г','Д','Е','Ж','З',
    'И','Й','К','Л','М','Н','О','П',
    'Р','С','Т','У','Ф','Х','Ц','Ч',
    'Ш','Щ','Ъ','Ы','Ь','Э','Ю','Я',
    'а','б','в','г','д','е','ж','з',
    'и','й','к','л','м','н','о','п',
    'р','с','т','у','ф','х','ц','ч',
    'ш','щ','ъ','ы','ь','э','ю','я',
];
const CODEC_MARKERS = { base64: '𐌁', emoji: '𐌄', cyrillic: '𐌓' };
const AES_IV_BYTES = 12;
const AES_TAG_BYTES = 16;

function normalizeKeyHex(value) {
    const key = String(value || '').trim().toLowerCase();
    if (!/^[0-9a-f]{64}$/u.test(key)) {
        throw new Error('VKEncrypt key must contain exactly 64 hexadecimal characters');
    }
    return key;
}

function keyMapFromOptions(options = {}) {
    const keys = new Map();
    for (const [keyId, value] of Object.entries(options.keys || {})) {
        keys.set(keyId, normalizeKeyHex(value));
    }
    if (options.key) {
        keys.set(options.keyId || 'k1', normalizeKeyHex(options.key));
    }
    if (options.seed) {
        for (const [keyId, key] of Object.entries(deriveKeysFromSeed(options.seed))) {
            keys.set(keyId, key);
        }
    }
    return keys;
}

export function deriveKeysFromSeed(seed) {
    const normalizedSeed = String(seed || '').trim();
    if (normalizedSeed.length < 6) {
        throw new Error('VKEncrypt seed must contain at least 6 characters');
    }
    const derived = pbkdf2Sync(
        Buffer.from(normalizedSeed, 'utf8'),
        Buffer.from(KDF_SALT, 'utf8'),
        KDF_ITERATIONS,
        128,
        'sha256',
    );
    return {
        k1: derived.subarray(0, 32).toString('hex'),
        k2: derived.subarray(32, 64).toString('hex'),
        k3: derived.subarray(64, 96).toString('hex'),
        k4: derived.subarray(96, 128).toString('hex'),
    };
}

function toCompactKeyId(keyId) {
    return /^k[1-4]$/u.test(keyId) ? keyId.slice(1) : keyId;
}

function fromCompactKeyId(keyId) {
    return /^[1-4]$/u.test(keyId) ? `k${keyId}` : keyId;
}

function encodeBase64ToAlphabet(base64, alphabet) {
    let output = '';
    for (const char of base64) {
        if (char === '=') continue;
        const index = BASE64_ALPHABET.indexOf(char);
        if (index < 0) throw new Error(`Invalid base64 character: ${char}`);
        output += alphabet[index];
    }
    return output;
}

function decodeAlphabetToBase64(payload, alphabet) {
    let output = '';
    for (const symbol of Array.from(payload)) {
        const index = alphabet.indexOf(symbol);
        if (index < 0) throw new Error(`Invalid cipher symbol: ${symbol}`);
        output += BASE64_ALPHABET[index];
    }
    return output + '='.repeat((4 - (output.length % 4)) % 4);
}

function encodePayload(base64, codec) {
    if (codec === 'base64') return base64.replace(/=+$/u, '');
    if (codec === 'cyrillic') return encodeBase64ToAlphabet(base64, CYRILLIC_ALPHABET);
    return encodeBase64ToAlphabet(base64, EMOJI_ALPHABET);
}

function decodePayload(payload, codec) {
    if (codec === 'base64') {
        return payload + '='.repeat((4 - (payload.length % 4)) % 4);
    }
    return decodeAlphabetToBase64(
        payload,
        codec === 'cyrillic' ? CYRILLIC_ALPHABET : EMOJI_ALPHABET,
    );
}

function codecFromMarker(marker) {
    if (marker === CODEC_MARKERS.base64) return 'base64';
    if (marker === CODEC_MARKERS.cyrillic) return 'cyrillic';
    if (marker === CODEC_MARKERS.emoji) return 'emoji';
    return null;
}

function decodeBase64Strict(value) {
    if (!/^[A-Za-z0-9+/]*={0,2}$/u.test(value) || value.length % 4 !== 0) {
        throw new Error('Invalid base64 payload');
    }
    return Buffer.from(value, 'base64');
}

export function encryptText(text, keyHex, keyId = 'k1', codec = 'emoji') {
    const key = Buffer.from(normalizeKeyHex(keyHex), 'hex');
    const iv = randomBytes(AES_IV_BYTES);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(String(text), 'utf8'), cipher.final()]);
    const payload = Buffer.concat([iv, encrypted, cipher.getAuthTag()]).toString('base64');
    const marker = CODEC_MARKERS[codec] ? codec : 'emoji';
    return `${FORMAT_START}${toCompactKeyId(keyId)}${FORMAT_MID}${CODEC_MARKERS[marker]}${FORMAT_PAYLOAD}${encodePayload(payload, marker)}`;
}

export function parseEncryptedText(text) {
    const value = String(text || '').trim();
    if (!value.startsWith(FORMAT_START)) return null;

    const match = new RegExp(
        `^${FORMAT_START}(.+?)${FORMAT_MID}([${Object.values(CODEC_MARKERS).join('')}])${FORMAT_PAYLOAD}(.+)$`,
        'su',
    ).exec(value);
    if (!match) return null;

    const codec = codecFromMarker(match[2]);
    if (!codec) return null;
    const base64 = decodePayload(match[3], codec);
    const payload = decodeBase64Strict(base64);
    if (payload.length < AES_IV_BYTES + AES_TAG_BYTES) {
        throw new Error('Encrypted payload is too short');
    }
    return {
        originalText: value,
        keyId: fromCompactKeyId(match[1]),
        codec,
        payload,
    };
}

export function decryptText(text, keys) {
    const parsed = parseEncryptedText(text);
    if (!parsed) return null;
    const keyHex = keys instanceof Map ? keys.get(parsed.keyId) : keys?.[parsed.keyId];
    if (!keyHex) return null;

    const key = Buffer.from(normalizeKeyHex(keyHex), 'hex');
    const iv = parsed.payload.subarray(0, AES_IV_BYTES);
    const tag = parsed.payload.subarray(parsed.payload.length - AES_TAG_BYTES);
    const ciphertext = parsed.payload.subarray(AES_IV_BYTES, parsed.payload.length - AES_TAG_BYTES);
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
    return { text: plaintext, keyId: parsed.keyId, codec: parsed.codec };
}

function sessionKey(accountId, peerId) {
    return `${accountId || 'default'}:${String(peerId)}`;
}

export function createVkEncryptMiddleware(options = {}) {
    const keys = keyMapFromOptions(options);
    const sessions = new Map();
    const rememberSessions = options.rememberSessions !== false;

    function decryptInbound(peerId, text, accountId = 'default') {
        if (!keys.size || typeof text !== 'string') return null;
        try {
            const result = decryptText(text, keys);
            if (!result) return null;
            if (rememberSessions) {
                sessions.set(sessionKey(accountId, peerId), {
                    keyId: result.keyId,
                    codec: result.codec,
                });
            }
            return result;
        } catch {
            return null;
        }
    }

    function encryptOutbound(peerId, text, accountId = 'default') {
        if (typeof text !== 'string') return text;
        const session = sessions.get(sessionKey(accountId, peerId));
        if (!session) return text;
        const keyHex = keys.get(session.keyId);
        return keyHex ? encryptText(text, keyHex, session.keyId, session.codec) : text;
    }

    function protectPayload(peerId, payload, accountId = 'default') {
        if (!payload || typeof payload !== 'object' || typeof payload.text !== 'string') {
            return payload;
        }
        const text = encryptOutbound(peerId, payload.text, accountId);
        return text === payload.text ? payload : { ...payload, text };
    }

    function wrapVkIo(vk) {
        if (vk?.[Symbol.for('vkencrypt.middleware')]) return vk[Symbol.for('vkencrypt.middleware')];
        const originalSend = vk?.api?.messages?.send;
        if (typeof originalSend !== 'function') {
            throw new Error('vk-io instance does not expose vk.api.messages.send');
        }
        const send = originalSend.bind(vk.api.messages);
        vk.api.messages.send = (params, ...rest) => {
            const peerId = params?.peer_id ?? params?.peerId;
            const nextParams = typeof params?.message === 'string'
                ? { ...params, message: encryptOutbound(peerId, params.message) }
                : params;
            return send(nextParams, ...rest);
        };
        const onMessage = (context) => {
            const result = decryptInbound(context.peerId, context.text, 'default');
            if (result) {
                context.text = result.text;
                context.vkencrypt = result;
            }
        };
        vk.updates?.on?.('message_new', onMessage);
        const handle = { decryptInbound, encryptOutbound, protectPayload };
        vk[Symbol.for('vkencrypt.middleware')] = handle;
        return handle;
    }

    return {
        keys,
        sessions,
        decryptInbound,
        encryptOutbound,
        protectPayload,
        wrapVkIo,
    };
}

export function createMiddlewareFromEnv(env = process.env) {
    const key = env.VK_ENCRYPT_KEY || env.VKENC_KEY;
    const seed = env.VK_ENCRYPT_SEED || env.VKENC_SEED;
    return createVkEncryptMiddleware({ key, seed });
}
