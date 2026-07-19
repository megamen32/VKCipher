const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const KDF_SALT = 'vk-p2p-aes-gcm-v1';
const KDF_ITERATIONS = 250_000;
const IV_LEN = 12;
const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const EMOJI_ALPHABET = [
    '😀','😁','😂','🤣','😃','😄','😅','😆',
    '😉','😊','😋','😎','😍','😘','🥰','😗',
    '😙','😚','🙂','🤗','🤩','🤔','🤨','😐',
    '😑','😶','🙄','😏','😣','😥','😮','🤐',
    '😯','😪','😫','🥱','😴','😌','😛','😜',
    '😝','🤤','😒','😓','😔','😕','🙃','🤑',
    '😲','😡','🤬','😖','😞','😟','😤','😢',
    '😭','😦','😧','😨','😩','🤯','😬','😰'
];
const EMOJI_PAD = '🟰';
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
const FORMAT_START = '𓁗';
const FORMAT_MID = 'Ⰴ';
const FORMAT_PAYLOAD = 'Ⱑ';
const MEDIA_CONTAINER_MAGIC = 'VKEM1';
const CODEC_MARKERS = {
    base64: '𐌁',
    emoji: '𐌄',
    cyrillic: '𐌓',
};
const RU_WORDS_DICTIONARY = fs.readFileSync(
    path.join(__dirname, '..', '..', 'extension', 'dictionaries', 'ru-common-8192-v3.txt'),
    'utf8'
).trim().split('\n');

function deriveDerivedKeys(seed) {
    const derived = crypto.pbkdf2Sync(seed, KDF_SALT, KDF_ITERATIONS, 128, 'sha256');
    return {
        k1: derived.subarray(0, 32).toString('hex'),
        k2: derived.subarray(32, 64).toString('hex'),
        k3: derived.subarray(64, 96).toString('hex'),
        k4: derived.subarray(96, 128).toString('hex'),
    };
}

function encryptForEmoji(plainText, keyHex) {
    const key = Buffer.from(keyHex, 'hex');
    const iv = crypto.randomBytes(IV_LEN);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const ct = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    const b64 = Buffer.concat([iv, ct, tag]).toString('base64');

    let out = '';
    for (const ch of b64) {
        if (ch === '=') {
            out += EMOJI_PAD;
            continue;
        }

        const idx = BASE64_ALPHABET.indexOf(ch);
        if (idx === -1) throw new Error(`Invalid base64 char: ${ch}`);
        out += EMOJI_ALPHABET[idx];
    }

    return out.replace(/🟰+$/u, '');
}

function makeBaseSettings(extra = {}) {
    return {
        autoEncrypt: false,
        saveDerivedKeys: true,
        autoDecrypt: true,
        emojiCipher: true,
        cipherCodec: 'emoji',
        ...extra,
    };
}

async function setComposerText(page, text) {
    await page.locator('[contenteditable="true"]').first().evaluate((el, value) => {
        el.focus();
        el.innerText = value;
        el.dispatchEvent(new InputEvent('input', {
            bubbles: true,
            inputType: 'insertText',
            data: value,
        }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
    }, text);
}

async function getComposerText(page) {
    return page.locator('[contenteditable="true"]').first().evaluate(el => el.innerText.trim());
}

function renderEmojiAsImages(payload) {
    return Array.from(payload).map(ch => {
        if (ch === '🟰') {
            return '🟰';
        }

        return `<img src=\"data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==\" alt=\"${ch}\" class=\"Emoji\">`;
    }).join('');
}

function encryptBinaryPayload(buffer, keyHex) {
    const key = Buffer.from(keyHex, 'hex');
    const iv = crypto.randomBytes(IV_LEN);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const ct = Buffer.concat([cipher.update(buffer), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, ct, tag]);
}

function buildEncryptedMediaContainer({ keyId = 'k1', keyHex, mime, originalName, body }) {
    const payload = encryptBinaryPayload(body, keyHex);
    const meta = Buffer.from(JSON.stringify({
        version: 1,
        keyId,
        mime,
        originalName,
        originalSize: body.length,
    }), 'utf8');
    const metaLen = Buffer.alloc(4);
    metaLen.writeUInt32BE(meta.length, 0);
    return Buffer.concat([
        Buffer.from(MEDIA_CONTAINER_MAGIC, 'utf8'),
        metaLen,
        meta,
        payload,
    ]);
}

function encodeBytesToWords(bytes) {
    const source = Buffer.concat([Buffer.alloc(4), Buffer.from(bytes)]);
    source.writeUInt32BE(bytes.length, 0);
    const words = [];
    let accumulator = 0;
    let bitCount = 0;

    for (const byte of source) {
        accumulator = (accumulator << 8) | byte;
        bitCount += 8;
        while (bitCount >= 13) {
            bitCount -= 13;
            words.push(RU_WORDS_DICTIONARY[(accumulator >>> bitCount) & 0x1fff]);
            accumulator = bitCount ? accumulator & ((1 << bitCount) - 1) : 0;
        }
    }
    if (bitCount) words.push(RU_WORDS_DICTIONARY[(accumulator << (13 - bitCount)) & 0x1fff]);
    return words.join(' ');
}

function encryptWordPackets(plainText, keyHex, chunkBytes = 300) {
    const source = Buffer.from(plainText, 'utf8');
    const groupId = crypto.randomBytes(12);
    const chunks = [];
    for (let offset = 0; offset < source.length; offset += chunkBytes) {
        chunks.push(source.subarray(offset, offset + chunkBytes));
    }

    return chunks.map((payload, partIndex) => {
        const packet = Buffer.alloc(32 + payload.length);
        Buffer.from('VKW1').copy(packet, 0);
        packet[4] = 1;
        packet[5] = 0;
        packet[6] = 1;
        packet[7] = 1;
        groupId.copy(packet, 8);
        packet.writeUInt16BE(partIndex, 20);
        packet.writeUInt16BE(chunks.length, 22);
        packet.writeUInt32BE(source.length, 24);
        packet.writeUInt32BE(payload.length, 28);
        payload.copy(packet, 32);
        return encodeBytesToWords(encryptBinaryPayload(packet, keyHex));
    });
}

module.exports = {
    BASE64_ALPHABET,
    EMOJI_ALPHABET,
    EMOJI_PAD,
    CYRILLIC_ALPHABET,
    FORMAT_START,
    FORMAT_MID,
    FORMAT_PAYLOAD,
    MEDIA_CONTAINER_MAGIC,
    CODEC_MARKERS,
    deriveDerivedKeys,
    encryptForEmoji,
    makeBaseSettings,
    setComposerText,
    getComposerText,
    renderEmojiAsImages,
    buildEncryptedMediaContainer,
    RU_WORDS_DICTIONARY,
    encodeBytesToWords,
    encryptWordPackets,
};
