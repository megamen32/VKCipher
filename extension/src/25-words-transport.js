    // ============================================================
    // Markerless Russian-word transport
    // ============================================================

    const WORDS_CODEC_ID = 1;
    const WORDS_PACKET_MAGIC = new Uint8Array([0x56, 0x4b, 0x57, 0x31]); // VKW1
    const WORDS_PACKET_HEADER_LEN = 32;
    const WORDS_GROUP_ID_LEN = 12;
    const WORDS_MAX_RAW_CHUNK = 1200;
    const WORD_FRAGMENT_GROUPS = new Map();
    const RU_WORDS_DICTIONARY_SET = new Set(RU_WORDS_DICTIONARY);
    let wordGroupsLoaded = false;

    function persistWordFragmentGroups() {
        try {
            const saved = Array.from(WORD_FRAGMENT_GROUPS.values())
                .filter(group => group.expiresAt > Date.now())
                .map(group => ({
                    key: group.key,
                    groupId: group.groupId,
                    partCount: group.partCount,
                    totalPlaintextLength: group.totalPlaintextLength,
                    compressed: group.compressed,
                    expiresAt: group.expiresAt,
                    parts: Array.from(group.parts.entries()).map(([index, part]) => ({
                        index,
                        payload: bytesToBase64(part.payload)
                    }))
                }));
            localStorage.setItem(WORDS_GROUP_STORAGE_KEY, JSON.stringify(saved));
        } catch {
            // Private browsing or disabled storage must not disable decryption.
        }
    }

    function loadWordFragmentGroups() {
        if (wordGroupsLoaded) return;
        wordGroupsLoaded = true;

        try {
            const saved = JSON.parse(localStorage.getItem(WORDS_GROUP_STORAGE_KEY) || '[]');
            saved.forEach(raw => {
                if (!raw || raw.expiresAt <= Date.now() || !raw.key) return;
                const group = {
                    ...raw,
                    parts: new Map(),
                    elements: new Map()
                };
                (raw.parts || []).forEach(part => {
                    if (Number.isInteger(part.index) && typeof part.payload === 'string') {
                        group.parts.set(part.index, {
                            partIndex: part.index,
                            payload: base64ToBytes(part.payload)
                        });
                    }
                });
                WORD_FRAGMENT_GROUPS.set(group.key, group);
            });
            persistWordFragmentGroups();
        } catch {
            localStorage.removeItem(WORDS_GROUP_STORAGE_KEY);
        }
    }

    function writeUint16(bytes, offset, value) {
        new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).setUint16(offset, value, false);
    }

    function readUint16(bytes, offset) {
        return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint16(offset, false);
    }

    function isWordsDictionaryText(text) {
        const words = String(text || '').trim().split(/\s+/u);
        return words.length > 0 && words.every(word => RU_WORDS_DICTIONARY_SET.has(word));
    }

    function encodeBytesToWords(bytes, dictionary = RU_WORDS_DICTIONARY) {
        if (!Number.isInteger(bytes.length) || bytes.length > 0xffffffff) {
            throw new Error('Слишком большой словарный payload');
        }

        const source = concatBytes([uint32ToBytes(bytes.length), bytes]);
        const words = [];
        let accumulator = 0;
        let bitCount = 0;

        source.forEach(byte => {
            accumulator = (accumulator << 8) | byte;
            bitCount += 8;

            while (bitCount >= WORDS_BITS) {
                bitCount -= WORDS_BITS;
                words.push(dictionary[(accumulator >>> bitCount) & 0x1fff]);
                accumulator = bitCount ? accumulator & ((1 << bitCount) - 1) : 0;
            }
        });

        if (bitCount) {
            words.push(dictionary[(accumulator << (WORDS_BITS - bitCount)) & 0x1fff]);
        }

        return words.join(' ');
    }

    function decodeWordsToBytes(text, dictionary = RU_WORDS_DICTIONARY) {
        const words = String(text || '').trim().split(/\s+/u);
        if (!words.length || words.length > 10000) throw new Error('Недопустимое число слов');

        const indexes = words.map(word => dictionary.indexOf(word));
        if (indexes.some(index => index < 0)) throw new Error('Слово отсутствует в словаре');

        const output = [];
        let accumulator = 0;
        let bitCount = 0;

        indexes.forEach(index => {
            accumulator = (accumulator << WORDS_BITS) | index;
            bitCount += WORDS_BITS;

            while (bitCount >= 8) {
                bitCount -= 8;
                output.push((accumulator >>> bitCount) & 0xff);
                accumulator = bitCount ? accumulator & ((1 << bitCount) - 1) : 0;
            }
        });

        if (bitCount && accumulator !== 0) throw new Error('Ненулевые биты заполнения');
        if (output.length < 4) throw new Error('Словарный payload слишком короткий');

        const outputBytes = Uint8Array.from(output);
        const length = bytesToUint32(outputBytes, 0);
        const expectedLength = length + 4;
        if (outputBytes.length < expectedLength) throw new Error('Неверная длина словарного payload');
        if (outputBytes.slice(expectedLength).some(byte => byte !== 0)) {
            throw new Error('Ненулевые биты после словарного payload');
        }
        return outputBytes.slice(4, expectedLength);
    }

    async function compressTransportBytes(bytes) {
        if (typeof CompressionStream !== 'function') {
            return { bytes, compressed: false };
        }

        const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'));
        const compressed = new Uint8Array(await new Response(stream).arrayBuffer());
        return compressed.length < bytes.length
            ? { bytes: compressed, compressed: true }
            : { bytes, compressed: false };
    }

    async function decompressTransportBytes(bytes) {
        if (typeof DecompressionStream !== 'function') {
            throw new Error('Эта платформа не умеет распаковывать gzip');
        }

        const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
        return new Uint8Array(await new Response(stream).arrayBuffer());
    }

    function buildWordsPacket(payload, metadata) {
        const packet = new Uint8Array(WORDS_PACKET_HEADER_LEN + payload.length);
        packet.set(WORDS_PACKET_MAGIC, 0);
        packet[4] = 1;
        packet[5] = metadata.compressed ? 1 : 0;
        packet[6] = WORDS_CODEC_ID;
        packet[7] = 1;
        packet.set(metadata.groupId, 8);
        writeUint16(packet, 20, metadata.partIndex);
        writeUint16(packet, 22, metadata.partCount);
        new DataView(packet.buffer).setUint32(24, metadata.totalPlaintextLength, false);
        new DataView(packet.buffer).setUint32(28, payload.length, false);
        packet.set(payload, WORDS_PACKET_HEADER_LEN);
        return packet;
    }

    function parseWordsPacket(packet) {
        if (packet.length < WORDS_PACKET_HEADER_LEN) throw new Error('Пакет слишком короткий');
        if (!WORDS_PACKET_MAGIC.every((value, index) => packet[index] === value)) {
            throw new Error('Неизвестная версия словарного пакета');
        }
        if (packet[4] !== 1 || packet[6] !== WORDS_CODEC_ID || packet[7] !== 1) {
            throw new Error('Несовместимый словарный пакет');
        }

        const payloadLength = bytesToUint32(packet, 28);
        if (payloadLength !== packet.length - WORDS_PACKET_HEADER_LEN) {
            throw new Error('Повреждённая длина словарного пакета');
        }

        return {
            compressed: Boolean(packet[5] & 1),
            groupId: bytesToHex(packet.slice(8, 20)),
            partIndex: readUint16(packet, 20),
            partCount: readUint16(packet, 22),
            totalPlaintextLength: bytesToUint32(packet, 24),
            payload: packet.slice(WORDS_PACKET_HEADER_LEN)
        };
    }

    function buildWordsPacketText(payload, metadata, keyHex) {
        return encryptBinaryAESGCM(buildWordsPacket(payload, metadata), keyHex)
            .then(encrypted => encodeBytesToWords(encrypted));
    }

    async function fitWordsChunk(payload, start, metadata, partCount, maxRawChunk) {
        const remaining = payload.length - start;
        const upper = Math.min(maxRawChunk, remaining);

        for (let size = upper; size > 0; size -= 1) {
            const candidate = payload.slice(start, start + size);
            const text = await buildWordsPacketText(candidate, {
                ...metadata,
                partIndex: 0,
                partCount
            }, metadata.keyHex);

            if (text.length <= MAX_VK_UTF16_UNITS) return size;
        }

        throw new Error('Даже минимальная часть не помещается в лимит VK');
    }

    async function encodePlaintextToWordMessages(plainText, keyHex) {
        const plainBytes = utf8ToBytes(plainText);
        const compressed = await compressTransportBytes(plainBytes);
        const groupId = crypto.getRandomValues(new Uint8Array(WORDS_GROUP_ID_LEN));
        const metadata = {
            compressed: compressed.compressed,
            groupId,
            totalPlaintextLength: plainBytes.length,
            keyHex
        };
        let maxRawChunk = WORDS_MAX_RAW_CHUNK;

        for (let attempt = 0; attempt < 32 && maxRawChunk > 0; attempt += 1) {
            let partCount = Math.max(1, Math.ceil(compressed.bytes.length / maxRawChunk));
            let chunks = [];

            for (let pass = 0; pass < 4; pass += 1) {
                chunks = [];
                let offset = 0;

                while (offset < compressed.bytes.length) {
                    const size = await fitWordsChunk(
                        compressed.bytes,
                        offset,
                        metadata,
                        partCount,
                        maxRawChunk
                    );
                    chunks.push(compressed.bytes.slice(offset, offset + size));
                    offset += size;
                }

                if (chunks.length === partCount) break;
                partCount = chunks.length;
            }

            const messages = await Promise.all(chunks.map((chunk, partIndex) => buildWordsPacketText(chunk, {
                ...metadata,
                partIndex,
                partCount: chunks.length
            }, keyHex)));

            if (messages.every(message => message.length <= MAX_VK_UTF16_UNITS)) {
                return messages;
            }

            // AES-GCM uses a fresh nonce for each attempt, so reserve margin
            // and validate the exact final strings before returning them.
            maxRawChunk -= 32;
        }

        throw new Error('Не удалось безопасно разбить словарное сообщение');
    }

    async function decryptWordMessage(text, keyHex) {
        if (!isWordsDictionaryText(text)) return null;

        const encrypted = decodeWordsToBytes(text);
        const packet = parseWordsPacket(await decryptBinaryAESGCM(encrypted, keyHex));
        if (!packet.partCount || packet.partIndex >= packet.partCount) {
            throw new Error('Неверная нумерация частей');
        }

        return packet;
    }

    async function completeWordGroup(group) {
        const ordered = [];
        for (let index = 0; index < group.partCount; index += 1) {
            const part = group.parts.get(index);
            if (!part) return null;
            ordered.push(part.payload);
        }

        const payload = concatBytes(ordered);
        const plainBytes = group.compressed
            ? await decompressTransportBytes(payload)
            : payload;

        if (plainBytes.length !== group.totalPlaintextLength) {
            throw new Error('Неверная длина исходного текста');
        }

        WORD_FRAGMENT_GROUPS.delete(group.key);
        persistWordFragmentGroups();
        return bytesToUtf8(plainBytes);
    }

    async function acceptWordFragment(packet, msgEl, originalText) {
        loadWordFragmentGroups();
        const key = `${currentChatContextId}:${packet.groupId}`;
        let group = WORD_FRAGMENT_GROUPS.get(key);

        if (!group || group.partCount !== packet.partCount || group.totalPlaintextLength !== packet.totalPlaintextLength) {
            group = {
                key,
                groupId: packet.groupId,
                partCount: packet.partCount,
                totalPlaintextLength: packet.totalPlaintextLength,
                compressed: packet.compressed,
                parts: new Map(),
                elements: new Map(),
                expiresAt: Date.now() + WORDS_GROUP_TTL_MS
            };
            WORD_FRAGMENT_GROUPS.set(key, group);
        }

        if (group.expiresAt < Date.now()) {
            WORD_FRAGMENT_GROUPS.delete(key);
            return null;
        }

        group.parts.set(packet.partIndex, packet);
        group.elements.set(packet.partIndex, msgEl);
        persistWordFragmentGroups();

        if (group.partCount > 1 && group.parts.size < group.partCount) {
            createFragmentStatusInterface(msgEl, group.parts.size, group.partCount, originalText);
            return null;
        }

        const decryptedText = await completeWordGroup(group);
        if (decryptedText === null) return null;

        const first = group.elements.get(0) || msgEl;
        createToggleInterface(originalText, decryptedText, first);
        group.elements.forEach((element, index) => {
            if (index !== 0) {
                element.textContent = '';
                element.dataset.vkdecDone = 'true';
                element.hidden = true;
            }
        });
        return decryptedText;
    }
