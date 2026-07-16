    // ============================================================
    // Crypto helpers
    // ============================================================

    function hexToBytes(hex) {
        if (!isValidKeyHex(hex)) throw new Error('Invalid key hex');
        const arr = new Uint8Array(hex.length / 2);
        for (let i = 0; i < hex.length; i += 2) {
            arr[i / 2] = parseInt(hex.substr(i, 2), 16);
        }
        return arr;
    }

    function bytesToHex(bytes) {
        return Array.from(bytes)
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
    }

    function bytesToBase64(bytes) {
        let binary = '';
        const chunkSize = 0x8000;

        for (let i = 0; i < bytes.length; i += chunkSize) {
            const chunk = bytes.subarray(i, i + chunkSize);
            binary += String.fromCharCode.apply(null, chunk);
        }

        return btoa(binary);
    }

    function utf8ToBytes(text) {
        return new TextEncoder().encode(text);
    }

    function bytesToUtf8(bytes) {
        return new TextDecoder().decode(bytes);
    }

    function concatBytes(parts) {
        const total = parts.reduce((sum, part) => sum + part.length, 0);
        const out = new Uint8Array(total);
        let offset = 0;

        parts.forEach(part => {
            out.set(part, offset);
            offset += part.length;
        });

        return out;
    }

    function uint32ToBytes(value) {
        const out = new Uint8Array(4);
        new DataView(out.buffer).setUint32(0, value, false);
        return out;
    }

    function bytesToUint32(bytes, offset = 0) {
        return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset, false);
    }

    function base64ToBytes(b64) {
        const bin = atob(b64);
        const data = new Uint8Array(bin.length);

        for (let i = 0; i < bin.length; i++) {
            data[i] = bin.charCodeAt(i);
        }

        return data;
    }

    function encodeBase64ToAlphabet(b64, alphabet, padChar = '=') {
        let out = '';

        for (const ch of b64) {
            if (ch === '=') {
                continue;
            }

            const idx = BASE64_ALPHABET.indexOf(ch);
            if (idx === -1) throw new Error('Invalid base64 char: ' + ch);
            out += alphabet[idx];
        }

        return out;
    }

    function decodeAlphabetToBase64(payload, alphabet, padChar = '=') {
        let out = '';

        for (const symbol of Array.from(payload)) {
            if (symbol === padChar) {
                out += '=';
                continue;
            }

            const idx = alphabet.indexOf(symbol);
            if (idx === -1) throw new Error('Invalid cipher symbol: ' + symbol);
            out += BASE64_ALPHABET[idx];
        }

        return out + '='.repeat((4 - (out.length % 4)) % 4);
    }

    function encodeBase64ToEmoji(b64) {
        return encodeBase64ToAlphabet(b64, EMOJI_ALPHABET, EMOJI_PAD);
    }

    function decodeEmojiToBase64(payload) {
        return decodeAlphabetToBase64(payload, EMOJI_ALPHABET, EMOJI_PAD);
    }

    function encodeBase64ToCyrillic(b64) {
        return encodeBase64ToAlphabet(b64, CYRILLIC_ALPHABET);
    }

    function decodeCyrillicToBase64(payload) {
        return decodeAlphabetToBase64(payload, CYRILLIC_ALPHABET);
    }

    function getCipherCodecConfig(codecId) {
        return CIPHER_CODECS[codecId] || CIPHER_CODECS.emoji;
    }

    function normalizeCodecId(codecId) {
        return Object.prototype.hasOwnProperty.call(CIPHER_CODECS, codecId) ? codecId : 'emoji';
    }

    function encodePayloadForCodec(b64, codecId) {
        switch (normalizeCodecId(codecId)) {
            case 'base64':
                return b64.replace(/=+$/u, '');
            case 'cyrillic':
                return encodeBase64ToCyrillic(b64);
            case 'emoji':
            default:
                return encodeBase64ToEmoji(b64);
        }
    }

    function decodePayloadForCodec(payload, codecId) {
        switch (normalizeCodecId(codecId)) {
            case 'base64':
                return payload + '='.repeat((4 - (payload.length % 4)) % 4);
            case 'cyrillic':
                return decodeCyrillicToBase64(payload);
            case 'emoji':
            default:
                return decodeEmojiToBase64(payload);
        }
    }

    function isValidBase64Payload(payload) {
        return typeof payload === 'string'
            && payload.length >= 4
            && payload.length % 4 === 0
            && /^[A-Za-z0-9+/]+={0,2}$/.test(payload);
    }

    function isPlausibleEncodedPayload(payload, codecId) {
        if (typeof payload !== 'string' || !payload) return false;

        try {
            const b64 = decodePayloadForCodec(payload, codecId);
            return isValidBase64Payload(b64);
        } catch {
            return false;
        }
    }

    function toCompactKeyId(slotId) {
        const match = /^k([1-4])$/.exec(slotId);
        return match ? match[1] : slotId;
    }

    function fromCompactKeyId(compactId) {
        return /^[1-4]$/.test(compactId) ? `k${compactId}` : compactId;
    }

    function formatEncryptedMessage(slotId, payload, codecId) {
        const codec = getCipherCodecConfig(codecId);
        return `${FORMAT_START}${toCompactKeyId(slotId)}${FORMAT_MID}${codec.shortCode}${FORMAT_PAYLOAD}${payload}`;
    }

    function parseEncryptedMessage(text) {
        const trimmed = (text || '').trim();
        const compactMatch = new RegExp(`^${FORMAT_START}(.+?)${FORMAT_MID}([${CODEC_MARKERS.base64}${CODEC_MARKERS.emoji}${CODEC_MARKERS.cyrillic}])${FORMAT_PAYLOAD}(.+)$`, 'su').exec(trimmed);
        if (!compactMatch) return null;

        const parsed = {
            originalText: trimmed,
            keyId: fromCompactKeyId(compactMatch[1]),
            codecId: compactMatch[2] === CODEC_MARKERS.emoji
                ? 'emoji'
                : compactMatch[2] === CODEC_MARKERS.cyrillic
                    ? 'cyrillic'
                    : 'base64',
            encodedPayload: compactMatch[3]
        };

        return isPlausibleEncodedPayload(parsed.encodedPayload, parsed.codecId)
            ? parsed
            : null;
    }

    async function deriveKeyMaterialFromSeed(seedText) {
        const encoder = new TextEncoder();

        const baseKey = await crypto.subtle.importKey(
            'raw',
            encoder.encode(seedText),
            'PBKDF2',
            false,
            ['deriveBits']
        );

        const bits = await crypto.subtle.deriveBits(
            {
                name: 'PBKDF2',
                salt: encoder.encode(KDF_SALT),
                iterations: KDF_ITERATIONS,
                hash: 'SHA-256'
            },
            baseKey,
            1024
        );

        const bytes = new Uint8Array(bits);

        return {
            k1: bytesToHex(bytes.slice(0, 32)),
            k2: bytesToHex(bytes.slice(32, 64)),
            k3: bytesToHex(bytes.slice(64, 96)),
            k4: bytesToHex(bytes.slice(96, 128))
        };
    }

    async function deriveKeyFromName(name) {
        if (!name || !name.trim()) {
            throw new Error('Пустое слово');
        }
        const hash = await crypto.subtle.digest(
            'SHA-256',
            new TextEncoder().encode(name.trim())
        );
        return bytesToHex(new Uint8Array(hash));
    }

    async function encryptAESGCM(plainText, keyHex) {
        const key = await crypto.subtle.importKey(
            'raw',
            hexToBytes(keyHex),
            { name: 'AES-GCM' },
            false,
            ['encrypt']
        );

        const iv = crypto.getRandomValues(new Uint8Array(IV_LEN));
        const data = new TextEncoder().encode(plainText);

        const encrypted = await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv, tagLength: 128 },
            key,
            data
        );

        const encryptedArr = new Uint8Array(encrypted);
        const payload = new Uint8Array(iv.length + encryptedArr.length);

        payload.set(iv);
        payload.set(encryptedArr, iv.length);

        return bytesToBase64(payload);
    }

    async function decryptAESGCM(b64Payload, keyHex) {
        const data = base64ToBytes(b64Payload);

        if (data.length < IV_LEN + TAG_LEN) {
            throw new Error('Data too short');
        }

        const iv = data.slice(0, IV_LEN);
        const ciphertextWithTag = data.slice(IV_LEN);

        const key = await crypto.subtle.importKey(
            'raw',
            hexToBytes(keyHex),
            { name: 'AES-GCM' },
            false,
            ['decrypt']
        );

        const decrypted = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv, tagLength: 128 },
            key,
            ciphertextWithTag
        );

        return new TextDecoder().decode(decrypted);
    }

    async function encryptBinaryAESGCM(dataBytes, keyHex) {
        const key = await crypto.subtle.importKey(
            'raw',
            hexToBytes(keyHex),
            { name: 'AES-GCM' },
            false,
            ['encrypt']
        );

        const iv = crypto.getRandomValues(new Uint8Array(IV_LEN));
        const encrypted = await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv, tagLength: 128 },
            key,
            dataBytes
        );

        return concatBytes([iv, new Uint8Array(encrypted)]);
    }

    async function decryptBinaryAESGCM(payloadBytes, keyHex) {
        if (payloadBytes.length < IV_LEN + TAG_LEN) {
            throw new Error('Media payload too short');
        }

        const key = await crypto.subtle.importKey(
            'raw',
            hexToBytes(keyHex),
            { name: 'AES-GCM' },
            false,
            ['decrypt']
        );

        const iv = payloadBytes.slice(0, IV_LEN);
        const ciphertextWithTag = payloadBytes.slice(IV_LEN);
        const decrypted = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv, tagLength: 128 },
            key,
            ciphertextWithTag
        );

        return new Uint8Array(decrypted);
    }

    function buildEncryptedMediaName(originalName) {
        const clean = String(originalName || 'media.bin').trim() || 'media.bin';
        return clean.endsWith(MEDIA_CONTAINER_EXT) ? clean : `${clean}${MEDIA_CONTAINER_EXT}`;
    }

    function isEncryptedMediaName(name) {
        return new RegExp(`${MEDIA_CONTAINER_EXT}(?:$|[?#])`, 'i').test(String(name || ''));
    }

    function isEncryptableMediaFile(file) {
        return Boolean(
            file &&
            typeof file.type === 'string' &&
            /^(image|audio|video)\//i.test(file.type)
        );
    }

    async function buildEncryptedMediaFile(file, keyHex, slotId) {
        const sourceBytes = new Uint8Array(await file.arrayBuffer());
        const encryptedPayload = await encryptBinaryAESGCM(sourceBytes, keyHex);
        const metadata = {
            version: 1,
            keyId: slotId,
            mime: file.type || 'application/octet-stream',
            originalName: file.name || 'media.bin',
            originalSize: file.size || sourceBytes.length
        };
        const metaBytes = utf8ToBytes(JSON.stringify(metadata));
        const header = concatBytes([
            utf8ToBytes(MEDIA_CONTAINER_MAGIC),
            uint32ToBytes(metaBytes.length),
            metaBytes
        ]);
        const containerBytes = concatBytes([header, encryptedPayload]);

        return new File(
            [containerBytes],
            buildEncryptedMediaName(file.name),
            {
                type: MEDIA_ENCRYPTED_MIME,
                lastModified: Date.now()
            }
        );
    }

    function parseEncryptedMediaContainer(bytes) {
        const magicBytes = utf8ToBytes(MEDIA_CONTAINER_MAGIC);

        if (bytes.length < magicBytes.length + 4 + IV_LEN + TAG_LEN) {
            throw new Error('Encrypted media container too short');
        }

        const actualMagic = bytesToUtf8(bytes.slice(0, magicBytes.length));
        if (actualMagic !== MEDIA_CONTAINER_MAGIC) {
            throw new Error('Unknown encrypted media format');
        }

        const metaLength = bytesToUint32(bytes, magicBytes.length);
        const metaStart = magicBytes.length + 4;
        const metaEnd = metaStart + metaLength;

        if (metaEnd > bytes.length) {
            throw new Error('Broken encrypted media metadata');
        }

        const metadata = JSON.parse(bytesToUtf8(bytes.slice(metaStart, metaEnd)));
        return {
            metadata,
            encryptedPayload: bytes.slice(metaEnd)
        };
    }

    function getAllKeys() {
        const all = {};

        if (DERIVED_KEYS) Object.assign(all, DERIVED_KEYS);
        if (CUSTOM_KEYS) {
            for (const [slot, info] of Object.entries(CUSTOM_KEYS)) {
                if (info && typeof info === 'object' && info.key) {
                    all[slot] = info.key;
                } else if (typeof info === 'string') {
                    all[slot] = info;
                }
            }
        }
        if (TEMP_KEY) all['@temp'] = TEMP_KEY;

        return all;
    }

    function getCustomKeyLabel(slot) {
        const info = CUSTOM_KEYS[slot];
        if (!info || typeof info !== 'object') return '';
        return info.label || '';
    }

    function getCurrentKeyHex() {
        return getAllKeys()[currentKeySlot] || null;
    }

    function hasAnyKeys() {
        return Boolean(DERIVED_KEYS || Object.keys(CUSTOM_KEYS).length || TEMP_KEY);
    }

