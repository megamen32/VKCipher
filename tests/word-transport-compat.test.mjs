import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WORDS_SOURCE = fs.readFileSync(path.join(ROOT, 'extension/src/25-words-transport.js'), 'utf8');
const USERSCRIPT = fs.readFileSync(path.join(ROOT, 'extension/vkencrypt.user.js'), 'utf8');

test('word transport does not require browser compression APIs', () => {
    for (const source of [WORDS_SOURCE, USERSCRIPT]) {
        assert.doesNotMatch(source, /new CompressionStream\(/u);
        assert.doesNotMatch(source, /new DecompressionStream\(/u);
    }
    assert.match(WORDS_SOURCE, /compressed: false/u);
});

test('published userscript embeds the complete Russian dictionary', () => {
    assert.match(USERSCRIPT, /WORDS_DICTIONARY_ID = ['"]ru-common-8192-v4['"]/u);
    assert.match(USERSCRIPT, /RU_WORDS_DICTIONARY_SHA256 = ['"]d6ce1bca2d8715a390842773d65a88b643e9f95bec6e9e4eda7b81c0aa88a2a4['"]/u);
    assert.match(USERSCRIPT, /const RU_WORDS_DICTIONARY = [\s\S]+\.split\(['"] ['"]\);/u);
});
