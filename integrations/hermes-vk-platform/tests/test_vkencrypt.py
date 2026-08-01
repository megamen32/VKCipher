from __future__ import annotations

import json
import os
import shutil
import subprocess
from pathlib import Path

import pytest

from vkencrypt import (
    NoEncryptedSession,
    VKEncryptSessions,
    decrypt_text,
    derive_keys_from_seed,
    encrypt_text,
    utf16_length,
)


SEED = "111111111111"
REPO_ROOT = Path(__file__).resolve().parents[3]
NODE_MIDDLEWARE = (REPO_ROOT / "bot/node/vkencrypt-middleware.mjs").as_uri()


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


def test_secret_file_must_be_owner_only(tmp_path, monkeypatch):
    seed_file = tmp_path / "seed"
    seed_file.write_text(SEED, encoding="utf-8")
    seed_file.chmod(0o644)
    monkeypatch.setenv("VK_ENCRYPT_SEED_FILE", str(seed_file))
    with pytest.raises(ValueError, match="owner-only"):
        VKEncryptSessions.from_env()
