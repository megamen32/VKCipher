const crypto = require('node:crypto');

const VK_LIMITS = Object.freeze({
    maxCodePoints: 4096,
    maxUtf16Units: 4096,
    maxLineBreaks: 100,
});

const ZERO_WIDTH_RE = /[\u200B-\u200F\u2060\uFEFF]/u;
const FORBIDDEN_CONTROL_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/u;

function codePointLength(text) {
    return Array.from(text).length;
}

function hasUnpairedSurrogate(text) {
    for (let index = 0; index < text.length; index += 1) {
        const code = text.charCodeAt(index);
        if (code >= 0xD800 && code <= 0xDBFF) {
            const next = text.charCodeAt(index + 1);
            if (!(next >= 0xDC00 && next <= 0xDFFF)) return true;
            index += 1;
        } else if (code >= 0xDC00 && code <= 0xDFFF) {
            return true;
        }
    }
    return false;
}

function inspectVkMessage(message, limits = VK_LIMITS) {
    const errors = [];
    if (typeof message !== 'string' || !message.length) errors.push('empty');
    if (typeof message !== 'string') return { valid: false, errors };
    if (codePointLength(message) > limits.maxCodePoints) errors.push('code-point-limit');
    if (message.length > limits.maxUtf16Units) errors.push('utf16-limit');
    if ((message.match(/\n/gu) || []).length > limits.maxLineBreaks) errors.push('line-break-limit');
    if (hasUnpairedSurrogate(message)) errors.push('invalid-unicode');
    if (ZERO_WIDTH_RE.test(message)) errors.push('zero-width-character');
    if (FORBIDDEN_CONTROL_RE.test(message)) errors.push('control-character');
    if (message !== message.normalize('NFC')) errors.push('not-nfc');

    return {
        valid: errors.length === 0,
        errors,
        codePoints: codePointLength(message),
        utf16Units: message.length,
        utf8Bytes: Buffer.byteLength(message, 'utf8'),
    };
}

function simulateVkTransport(message) {
    return message
        .replace(/\r\n?/gu, '\n')
        .normalize('NFC')
        .trim();
}

function deriveArenaBytes(label, size) {
    const chunks = [];
    let counter = 0;
    while (Buffer.concat(chunks).length < size) {
        chunks.push(crypto.createHash('sha256').update(`${label}:${counter}`).digest());
        counter += 1;
    }
    return Buffer.concat(chunks).subarray(0, size);
}

function sealMessage(plainText, roundId) {
    const key = deriveArenaBytes('vkencrypt-arena-key', 32);
    const iv = deriveArenaBytes(`vkencrypt-arena-iv:${roundId}`, 12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const ciphertext = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
    return Buffer.concat([iv, ciphertext, cipher.getAuthTag()]);
}

function openMessage(payload) {
    const bytes = Buffer.from(payload);
    if (bytes.length < 28) throw new Error('Ciphertext is too short');
    const key = deriveArenaBytes('vkencrypt-arena-key', 32);
    const iv = bytes.subarray(0, 12);
    const tag = bytes.subarray(bytes.length - 16);
    const ciphertext = bytes.subarray(12, bytes.length - 16);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

function makeRng(seed) {
    let state = seed >>> 0;
    return () => {
        state += 0x6D2B79F5;
        let value = state;
        value = Math.imul(value ^ (value >>> 15), value | 1);
        value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
        return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
}

module.exports = {
    VK_LIMITS,
    codePointLength,
    inspectVkMessage,
    simulateVkTransport,
    sealMessage,
    openMessage,
    makeRng,
};
