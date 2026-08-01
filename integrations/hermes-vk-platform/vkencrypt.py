"""VKEncrypt text compatibility for the Hermes VK platform plugin.

The format intentionally mirrors ``bot/node/vkencrypt-middleware.mjs`` and
the userscript: AES-256-GCM, PBKDF2-SHA256, and the same envelope/codecs.
"""

from __future__ import annotations

import base64
import binascii
import hashlib
import os
import re
import stat
from dataclasses import dataclass
from pathlib import Path
from typing import Mapping, Optional

FORMAT_START = "𓁗"
FORMAT_MID = "Ⰴ"
FORMAT_PAYLOAD = "Ⱑ"
KDF_SALT = b"vk-p2p-aes-gcm-v1"
KDF_ITERATIONS = 250_000
AES_IV_BYTES = 12
AES_TAG_BYTES = 16
BASE64_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
EMOJI_ALPHABET = tuple(
    "😀😁😂🤣😃😄😅😆"
    "😉😊😋😎😍😘🥰😗"
    "😙😚🙂🤗🤩🤔🤨😐"
    "😑😶🙄😏😣😥😮🤐"
    "😯😪😫🥱😴😌😛😜"
    "😝🤤😒😓😔😕🙃🤑"
    "😲😡🤬😖😞😟😤😢"
    "😭😦😧😨😩🤯😬😰"
)
CYRILLIC_ALPHABET = tuple(
    "АБВГДЕЖЗ"
    "ИЙКЛМНОП"
    "РСТУФХЦЧ"
    "ШЩЪЫЬЭЮЯ"
    "абвгдежз"
    "ийклмноп"
    "рстуфхцч"
    "шщъыьэюя"
)
CODEC_MARKERS = {"base64": "𐌁", "emoji": "𐌄", "cyrillic": "𐌓"}
MARKER_TO_CODEC = {marker: codec for codec, marker in CODEC_MARKERS.items()}
_ENVELOPE_RE = re.compile(
    rf"^{re.escape(FORMAT_START)}(.+?){re.escape(FORMAT_MID)}"
    rf"([{''.join(CODEC_MARKERS.values())}]){re.escape(FORMAT_PAYLOAD)}(.+)$",
    re.DOTALL,
)


class VKEncryptError(ValueError):
    """Invalid VKEncrypt input or unavailable crypto backend."""


class NoEncryptedSession(VKEncryptError):
    """Outbound encryption was requested before a peer established a session."""


@dataclass(frozen=True)
class DecryptedText:
    text: str
    key_id: str
    codec: str


@dataclass(frozen=True)
class ParsedText:
    key_id: str
    codec: str
    payload: bytes


def derive_keys_from_seed(seed: str) -> dict[str, str]:
    normalized = str(seed or "").strip()
    if len(normalized) < 6:
        raise VKEncryptError("VKEncrypt seed must contain at least 6 characters")
    material = hashlib.pbkdf2_hmac("sha256", normalized.encode(), KDF_SALT, KDF_ITERATIONS, 128)
    return {f"k{index + 1}": material[index * 32 : (index + 1) * 32].hex() for index in range(4)}


def _normalize_key_hex(value: str) -> str:
    key = str(value or "").strip().lower()
    if not re.fullmatch(r"[0-9a-f]{64}", key):
        raise VKEncryptError("VKEncrypt key must contain exactly 64 hexadecimal characters")
    return key


def _encode_alphabet(value: str, alphabet: tuple[str, ...]) -> str:
    result: list[str] = []
    for char in value:
        if char == "=":
            continue
        try:
            result.append(alphabet[BASE64_ALPHABET.index(char)])
        except (ValueError, IndexError) as exc:
            raise VKEncryptError("Invalid base64 character") from exc
    return "".join(result)


def _decode_alphabet(value: str, alphabet: tuple[str, ...]) -> str:
    result: list[str] = []
    positions = {symbol: index for index, symbol in enumerate(alphabet)}
    for symbol in value:
        try:
            result.append(BASE64_ALPHABET[positions[symbol]])
        except KeyError as exc:
            raise VKEncryptError("Invalid cipher symbol") from exc
    decoded = "".join(result)
    return decoded + "=" * ((4 - len(decoded) % 4) % 4)


def _decode_base64(value: str) -> bytes:
    if not re.fullmatch(r"[A-Za-z0-9+/]*={0,2}", value) or len(value) % 4:
        raise VKEncryptError("Invalid base64 payload")
    try:
        return base64.b64decode(value, validate=True)
    except (ValueError, binascii.Error) as exc:
        raise VKEncryptError("Invalid base64 payload") from exc


def _aes_encrypt(key: bytes, iv: bytes, plaintext: bytes) -> bytes:
    try:
        from cryptography.hazmat.primitives.ciphers.aead import AESGCM

        return AESGCM(key).encrypt(iv, plaintext, None)
    except ImportError:
        try:
            from Crypto.Cipher import AES
        except ImportError as exc:  # pragma: no cover - depends on host package set
            raise VKEncryptError("Install cryptography or pycryptodome for VKEncrypt") from exc
        cipher = AES.new(key, AES.MODE_GCM, nonce=iv)
        ciphertext, tag = cipher.encrypt_and_digest(plaintext)
        return ciphertext + tag


def _aes_decrypt(key: bytes, iv: bytes, ciphertext_with_tag: bytes) -> bytes:
    try:
        from cryptography.hazmat.primitives.ciphers.aead import AESGCM

        return AESGCM(key).decrypt(iv, ciphertext_with_tag, None)
    except ImportError:
        try:
            from Crypto.Cipher import AES
        except ImportError as exc:  # pragma: no cover - depends on host package set
            raise VKEncryptError("Install cryptography or pycryptodome for VKEncrypt") from exc
        if len(ciphertext_with_tag) < AES_TAG_BYTES:
            raise VKEncryptError("Encrypted payload is too short")
        cipher = AES.new(key, AES.MODE_GCM, nonce=iv)
        ciphertext = ciphertext_with_tag[:-AES_TAG_BYTES]
        tag = ciphertext_with_tag[-AES_TAG_BYTES:]
        try:
            return cipher.decrypt_and_verify(ciphertext, tag)
        except ValueError as exc:
            raise VKEncryptError("VKEncrypt authentication failed") from exc


def encrypt_text(text: str, key_hex: str, key_id: str = "k1", codec: str = "emoji") -> str:
    key = bytes.fromhex(_normalize_key_hex(key_hex))
    selected_codec = codec if codec in CODEC_MARKERS else "emoji"
    iv = os.urandom(AES_IV_BYTES)
    payload = iv + _aes_encrypt(key, iv, str(text).encode())
    encoded = base64.b64encode(payload).decode()
    if selected_codec == "base64":
        encoded = encoded.rstrip("=")
    elif selected_codec == "emoji":
        encoded = _encode_alphabet(encoded, EMOJI_ALPHABET)
    else:
        encoded = _encode_alphabet(encoded, CYRILLIC_ALPHABET)
    compact_id = key_id[1:] if re.fullmatch(r"k[1-4]", key_id) else key_id
    return f"{FORMAT_START}{compact_id}{FORMAT_MID}{CODEC_MARKERS[selected_codec]}{FORMAT_PAYLOAD}{encoded}"


def is_encrypted_text(text: str) -> bool:
    return isinstance(text, str) and text.strip().startswith(FORMAT_START)


def parse_encrypted_text(text: str) -> Optional[ParsedText]:
    value = str(text or "").strip()
    match = _ENVELOPE_RE.match(value)
    if not match:
        return None
    compact_id, marker, encoded = match.groups()
    codec = MARKER_TO_CODEC.get(marker)
    if codec == "base64":
        base64_payload = encoded + "=" * ((4 - len(encoded) % 4) % 4)
    elif codec == "emoji":
        base64_payload = _decode_alphabet(encoded, EMOJI_ALPHABET)
    elif codec == "cyrillic":
        base64_payload = _decode_alphabet(encoded, CYRILLIC_ALPHABET)
    else:  # pragma: no cover - regex restricts markers
        return None
    payload = _decode_base64(base64_payload)
    if len(payload) < AES_IV_BYTES + AES_TAG_BYTES:
        raise VKEncryptError("Encrypted payload is too short")
    key_id = f"k{compact_id}" if re.fullmatch(r"[1-4]", compact_id) else compact_id
    return ParsedText(key_id=key_id, codec=codec, payload=payload)


def decrypt_text(text: str, keys: Mapping[str, str]) -> Optional[DecryptedText]:
    parsed = parse_encrypted_text(text)
    if parsed is None:
        return None
    key_hex = keys.get(parsed.key_id)
    if not key_hex:
        return None
    payload = parsed.payload
    plaintext = _aes_decrypt(bytes.fromhex(_normalize_key_hex(key_hex)), payload[:AES_IV_BYTES], payload[AES_IV_BYTES:])
    return DecryptedText(plaintext.decode("utf-8"), parsed.key_id, parsed.codec)


def _read_secret_file(path: str) -> str:
    expanded = Path(os.path.expanduser(path))
    if expanded.stat().st_mode & (stat.S_IRWXG | stat.S_IRWXO):
        raise VKEncryptError(f"VKEncrypt secret file must be owner-only: {expanded}")
    return expanded.read_text(encoding="utf-8").strip()


def utf16_length(value: str) -> int:
    """Match the UTF-16 code-unit length used by browser/VK limits."""
    return len(str(value).encode("utf-16-le")) // 2


class VKEncryptSessions:
    """Per-account/per-peer text sessions compatible with the Node middleware."""

    def __init__(
        self,
        keys: Mapping[str, str],
        *,
        require_session: bool = True,
        allow_unencrypted_media: bool = False,
    ) -> None:
        self.keys = {key_id: _normalize_key_hex(value) for key_id, value in keys.items()}
        self.require_session = require_session
        self.allow_unencrypted_media = allow_unencrypted_media
        self.sessions: dict[tuple[str, str], tuple[str, str]] = {}

    @classmethod
    def from_env(cls, extra: Optional[Mapping[str, object]] = None) -> "VKEncryptSessions":
        extra = extra or {}
        seed_file = str(os.getenv("VK_ENCRYPT_SEED_FILE") or extra.get("vkencrypt_seed_file") or "").strip()
        seed = str(os.getenv("VK_ENCRYPT_SEED") or extra.get("vkencrypt_seed") or "").strip()
        if seed_file:
            seed = _read_secret_file(seed_file)
        key_file = str(os.getenv("VK_ENCRYPT_KEY_FILE") or extra.get("vkencrypt_key_file") or "").strip()
        key = str(os.getenv("VK_ENCRYPT_KEY") or extra.get("vkencrypt_key") or "").strip()
        if key_file:
            key = _read_secret_file(key_file)
        keys = derive_keys_from_seed(seed) if seed else ({"k1": _normalize_key_hex(key)} if key else {})
        return cls(
            keys,
            require_session=not _truthy(os.getenv("VK_ENCRYPT_ALLOW_PLAINTEXT") or extra.get("vkencrypt_allow_plaintext")),
            allow_unencrypted_media=_truthy(
                os.getenv("VK_ENCRYPT_ALLOW_UNENCRYPTED_MEDIA") or extra.get("vkencrypt_allow_unencrypted_media")
            ),
        )

    @property
    def enabled(self) -> bool:
        return bool(self.keys)

    @staticmethod
    def _session_key(account_id: str, peer_id: object) -> tuple[str, str]:
        return (account_id or "default", str(peer_id))

    def has_session(self, peer_id: object, account_id: str = "default") -> bool:
        return self._session_key(account_id, peer_id) in self.sessions

    def decrypt_inbound(self, peer_id: object, text: str, account_id: str = "default") -> Optional[DecryptedText]:
        if not self.enabled or not isinstance(text, str):
            return None
        result = decrypt_text(text, self.keys)
        if result:
            self.sessions[self._session_key(account_id, peer_id)] = (result.key_id, result.codec)
        return result

    def encrypt_outbound(self, peer_id: object, text: str, account_id: str = "default") -> str:
        session = self.sessions.get(self._session_key(account_id, peer_id))
        if not session:
            if self.require_session:
                raise NoEncryptedSession(f"No VKEncrypt session for peer {peer_id}")
            return str(text)
        key_id, codec = session
        return encrypt_text(text, self.keys[key_id], key_id, codec)

    def encrypted_chunks(self, peer_id: object, text: str, max_length: int, account_id: str = "default") -> list[str]:
        if not text:
            return []
        chunks: list[str] = []
        remaining = str(text)
        while remaining:
            low, high = 1, min(len(remaining), max_length)
            best: Optional[tuple[int, str]] = None
            while low <= high:
                size = (low + high) // 2
                candidate = self.encrypt_outbound(peer_id, remaining[:size], account_id)
                if utf16_length(candidate) <= max_length:
                    best = (size, candidate)
                    low = size + 1
                else:
                    high = size - 1
            if best is None:
                raise VKEncryptError("VK message limit is too small for the encrypted envelope")
            size, candidate = best
            chunks.append(candidate)
            remaining = remaining[size:]
        return chunks


def _truthy(value: object) -> bool:
    return str(value or "").strip().lower() in {"1", "true", "yes", "y", "on"}
