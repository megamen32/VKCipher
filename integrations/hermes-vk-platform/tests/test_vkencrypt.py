from __future__ import annotations

import json
import os
import shutil
import subprocess
from pathlib import Path

import pytest

from vkencrypt import (
    NoEncryptedSession,
    PendingWordFragment,
    RU_WORDS_DICTIONARY,
    VKEncryptSessions,
    decrypt_text,
    derive_keys_from_seed,
    encrypt_text,
    is_words_dictionary_text,
    utf16_length,
)


SEED = "111111111111"
REPO_ROOT = Path(__file__).resolve().parents[3]
NODE_MIDDLEWARE = (REPO_ROOT / "bot/node/vkencrypt-middleware.mjs").as_uri()
NODE_TEST_SUPPORT = REPO_ROOT / "tests/playwright/test-support.js"
WORDS_DICTIONARY = REPO_ROOT / "extension/dictionaries/ru-common-8192-v4.txt"


def test_seed_derivation_matches_node_middleware():
    assert derive_keys_from_seed(SEED) == {
        "k1": "dfad944a1a2875174931dc364eb24b287f4d9a8816ce518e3b1c76cc794f0ae0",
        "k2": "23b2b5e4f54e0be553bc99533d2648500b982f6e9d2287f020bcdf3aaaa224ba",
        "k3": "9f138ecbd7f38b5bf56adbd4b961d2027edec4dfaa4f1d6e7b7f38c2761168d9",
        "k4": "c22040841c0340ac407ddb38e611ef2715662b3a56dbb56e848ea9998e55dc3b",
    }


@pytest.mark.parametrize("codec", ["emoji", "cyrillic", "base64"])
def test_python_round_trip(codec):
    keys = derive_keys_from_seed(SEED)
    payload = encrypt_text("Привет, Hermes 🔐", keys["k1"], "k1", codec)
    result = decrypt_text(payload, keys)
    assert result is not None
    assert (result.text, result.key_id, result.codec) == ("Привет, Hermes 🔐", "k1", codec)


@pytest.mark.skipif(shutil.which("node") is None, reason="Node.js is required for cross-runtime verification")
def test_python_payload_decrypts_in_node():
    keys = derive_keys_from_seed(SEED)
    payload = encrypt_text("cross-runtime from Python", keys["k1"], "k1", "emoji")
    script = (
        "import { decryptText } from "
        + json.dumps(NODE_MIDDLEWARE)
        + "; "
        + "const result = decryptText(process.env.VKENC_PAYLOAD, {k1: process.env.VKENC_KEY}); "
        + "console.log(result?.text || '');"
    )
    result = subprocess.run(
        ["node", "--input-type=module", "-e", script],
        check=True,
        capture_output=True,
        text=True,
        env={**dict(os.environ), "VKENC_PAYLOAD": payload, "VKENC_KEY": keys["k1"]},
    )
    assert result.stdout.strip() == "cross-runtime from Python"


@pytest.mark.skipif(shutil.which("node") is None, reason="Node.js is required for cross-runtime verification")
def test_node_payload_decrypts_in_python():
    keys = derive_keys_from_seed(SEED)
    script = (
        "import { encryptText } from "
        + json.dumps(NODE_MIDDLEWARE)
        + "; "
        + "console.log(encryptText('cross-runtime from Node', process.env.VKENC_KEY, 'k1', 'emoji'));"
    )
    result = subprocess.run(
        ["node", "--input-type=module", "-e", script],
        check=True,
        capture_output=True,
        text=True,
        env={**dict(os.environ), "VKENC_KEY": keys["k1"]},
    )
    decrypted = decrypt_text(result.stdout.strip(), keys)
    assert decrypted is not None
    assert decrypted.text == "cross-runtime from Node"


def test_sessions_remember_codec_and_fail_closed_without_handshake():
    keys = derive_keys_from_seed(SEED)
    sessions = VKEncryptSessions(keys)
    with pytest.raises(NoEncryptedSession):
        sessions.encrypt_outbound("2000000001", "reply")

    inbound = encrypt_text("question", keys["k2"], "k2", "cyrillic")
    decrypted = sessions.decrypt_inbound("2000000001", inbound)
    assert decrypted is not None and decrypted.key_id == "k2" and decrypted.codec == "cyrillic"
    outbound = sessions.encrypt_outbound("2000000001", "reply")
    assert decrypt_text(outbound, keys).text == "reply"


def test_encrypted_chunks_respect_vk_limit():
    keys = derive_keys_from_seed(SEED)
    sessions = VKEncryptSessions(keys)
    sessions.decrypt_inbound("42", encrypt_text("handshake", keys["k1"], "k1", "emoji"))
    chunks = sessions.encrypted_chunks("42", "A" * 300, max_length=240)
    assert chunks and all(utf16_length(chunk) <= 240 for chunk in chunks)
    assert "".join(decrypt_text(chunk, keys).text for chunk in chunks) == "A" * 300


def _node_word_packets(text: str, key_hex: str, chunk_bytes: int = 300) -> list[str]:
    script = (
        "const { encryptWordPackets } = require(process.env.VKENC_SUPPORT); "
        "console.log(JSON.stringify(encryptWordPackets(process.env.VKENC_TEXT, process.env.VKENC_KEY, "
        "Number(process.env.VKENC_CHUNK))));"
    )
    result = subprocess.run(
        ["node", "-e", script],
        check=True,
        capture_output=True,
        text=True,
        env={
            **dict(os.environ),
            "VKENC_SUPPORT": str(NODE_TEST_SUPPORT),
            "VKENC_TEXT": text,
            "VKENC_KEY": key_hex,
            "VKENC_CHUNK": str(chunk_bytes),
        },
    )
    return json.loads(result.stdout)


def _node_decrypt_word_packets(packets: list[str], key_hex: str) -> str:
    script = r"""
const fs = require('fs');
const crypto = require('crypto');
const zlib = require('zlib');
const words = fs.readFileSync(process.env.VKENC_DICT, 'utf8').trim().split('\n');
const indexes = new Map(words.map((word, index) => [word, index]));
function decodeWords(text) {
  const output = [];
  let accumulator = 0;
  let bitCount = 0;
  for (const word of text.trim().split(/\s+/u)) {
    accumulator = (accumulator << 13) | indexes.get(word);
    bitCount += 13;
    while (bitCount >= 8) {
      bitCount -= 8;
      output.push((accumulator >>> bitCount) & 0xff);
      accumulator = bitCount ? accumulator & ((1 << bitCount) - 1) : 0;
    }
  }
  const bytes = Buffer.from(output);
  return bytes.subarray(4, 4 + bytes.readUInt32BE(0));
}
function decryptPacket(text) {
  const encrypted = decodeWords(text);
  const body = encrypted.subarray(12);
  const decipher = crypto.createDecipheriv('aes-256-gcm', Buffer.from(process.env.VKENC_KEY, 'hex'), encrypted.subarray(0, 12));
  decipher.setAuthTag(body.subarray(-16));
  return Buffer.concat([decipher.update(body.subarray(0, -16)), decipher.final()]);
}
const packets = JSON.parse(process.env.VKENC_PACKETS).map(decryptPacket);
packets.sort((a, b) => a.readUInt16BE(20) - b.readUInt16BE(20));
const payload = Buffer.concat(packets.map(packet => packet.subarray(32)));
const plain = packets[0][5] & 1 ? zlib.gunzipSync(payload) : payload;
process.stdout.write(plain.toString('utf8'));
"""
    result = subprocess.run(
        ["node", "-e", script],
        check=True,
        capture_output=True,
        text=True,
        env={
            **dict(os.environ),
            "VKENC_DICT": str(WORDS_DICTIONARY),
            "VKENC_KEY": key_hex,
            "VKENC_PACKETS": json.dumps(packets, ensure_ascii=False),
        },
    )
    return result.stdout


@pytest.mark.skipif(shutil.which("node") is None, reason="Node.js is required for userscript compatibility")
def test_words_dictionary_is_exact_and_plaintext_is_not_accepted():
    assert len(RU_WORDS_DICTIONARY) == 8192
    assert is_words_dictionary_text("вечер причина окно работа дорога")
    assert not is_words_dictionary_text("обычная фраза")

    sessions = VKEncryptSessions(derive_keys_from_seed(SEED))
    assert sessions.decrypt_inbound("42", "вечер причина окно работа дорога") is None
    assert not sessions.has_session("42")


@pytest.mark.skipif(shutil.which("node") is None, reason="Node.js is required for userscript compatibility")
def test_node_userscript_word_packet_decrypts_and_remembers_words_codec():
    keys = derive_keys_from_seed(SEED)
    packets = _node_word_packets("Привет, словарный Hermes!", keys["k1"], chunk_bytes=300)
    sessions = VKEncryptSessions(keys)

    result = sessions.decrypt_inbound("42", packets[0])
    assert result is not None
    assert result.text == "Привет, словарный Hermes!"
    assert result.key_id == "k1"
    assert result.codec == "words"
    assert sessions.has_session("42")

    reply = sessions.encrypt_outbound("42", "Ответ словами")
    assert is_words_dictionary_text(reply)
    assert _node_decrypt_word_packets([reply], keys["k1"]) == "Ответ словами"


@pytest.mark.skipif(shutil.which("node") is None, reason="Node.js is required for userscript compatibility")
def test_node_userscript_word_multipart_waits_then_reassembles():
    keys = derive_keys_from_seed(SEED)
    plaintext = "Длинное словарное сообщение. " * 80
    packets = _node_word_packets(plaintext, keys["k1"], chunk_bytes=180)
    assert len(packets) > 1

    sessions = VKEncryptSessions(keys)
    for packet in packets[:-1]:
        pending = sessions.decrypt_inbound("42", packet)
        assert isinstance(pending, PendingWordFragment)
        assert pending.codec == "words"

    result = sessions.decrypt_inbound("42", packets[-1])
    assert result is not None
    assert result.text == plaintext
    assert result.codec == "words"


@pytest.mark.skipif(shutil.which("node") is None, reason="Node.js is required for userscript compatibility")
def test_python_word_reply_with_gzip_is_decrypted_by_node():
    keys = derive_keys_from_seed(SEED)
    sessions = VKEncryptSessions(keys)
    handshake = _node_word_packets("handshake", keys["k1"])[0]
    sessions.decrypt_inbound("42", handshake)

    plaintext = "Длинный ответ Hermes в русском словарном формате. " * 80
    replies = sessions.encrypted_chunks("42", plaintext, max_length=4000)
    assert replies
    assert _node_decrypt_word_packets(replies, keys["k1"]) == plaintext


def test_secret_file_must_be_owner_only(tmp_path, monkeypatch):
    seed_file = tmp_path / "seed"
    seed_file.write_text(SEED, encoding="utf-8")
    seed_file.chmod(0o644)
    monkeypatch.setenv("VK_ENCRYPT_SEED_FILE", str(seed_file))
    with pytest.raises(ValueError, match="owner-only"):
        VKEncryptSessions.from_env()


def test_direct_seed_from_web_ui_overrides_existing_seed_file(tmp_path, monkeypatch):
    seed_file = tmp_path / "seed"
    seed_file.write_text(SEED, encoding="utf-8")
    seed_file.chmod(0o600)
    monkeypatch.setenv("VK_ENCRYPT_SEED_FILE", str(seed_file))
    monkeypatch.setenv("VK_ENCRYPT_SEED", "web-ui-rotated-seed")
    monkeypatch.delenv("VK_ENCRYPT_KEY_FILE", raising=False)
    monkeypatch.delenv("VK_ENCRYPT_KEY", raising=False)

    sessions = VKEncryptSessions.from_env()

    assert sessions.keys == derive_keys_from_seed("web-ui-rotated-seed")
