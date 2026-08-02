"""VKEncrypt text compatibility for the Hermes VK platform plugin.

The format intentionally mirrors ``bot/node/vkencrypt-middleware.mjs`` and
the userscript: AES-256-GCM, PBKDF2-SHA256, and the same envelope/codecs.
"""

from __future__ import annotations

import base64
import binascii
import gzip
import hashlib
import logging
import os
import re
import stat
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Mapping, Optional

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
WORDS_DICTIONARY_ID = "ru-common-8192-v4"
WORDS_DICTIONARY_SHA256 = "d6ce1bca2d8715a390842773d65a88b643e9f95bec6e9e4eda7b81c0aa88a2a4"
WORDS_BITS = 13
WORDS_PACKET_MAGIC = b"VKW1"
WORDS_PACKET_HEADER_LEN = 32
WORDS_GROUP_ID_LEN = 12
WORDS_MAX_WORDS = 10_000
WORDS_MAX_PACKET_BYTES = 1 << 20
WORDS_MAX_PLAINTEXT_BYTES = 16 << 20
WORDS_GROUP_TTL_SECONDS = 7 * 24 * 60 * 60
WORDS_DICTIONARY_PATH = Path(__file__).with_name(f"{WORDS_DICTIONARY_ID}.txt")
logger = logging.getLogger(__name__)
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


@dataclass(frozen=True)
class ParsedWordPacket:
    key_id: str
    compressed: bool
    group_id: str
    part_index: int
    part_count: int
    total_plaintext_length: int
    payload: bytes


@dataclass(frozen=True)
class PendingWordFragment:
    key_id: str
    codec: str
    group_id: str
    part_index: int
    part_count: int
    received_count: int


@dataclass
class _WordGroup:
    key_id: str
    compressed: bool
    part_count: int
    total_plaintext_length: int
    parts: dict[int, bytes]
    expires_at: float


def _load_words_dictionary() -> tuple[str, ...]:
    try:
        raw = WORDS_DICTIONARY_PATH.read_bytes()
    except OSError as exc:
        raise VKEncryptError(f"Missing VKEncrypt dictionary: {WORDS_DICTIONARY_PATH}") from exc
    digest = hashlib.sha256(raw).hexdigest()
    if digest != WORDS_DICTIONARY_SHA256:
        raise VKEncryptError(
            f"VKEncrypt dictionary hash mismatch: expected {WORDS_DICTIONARY_SHA256}, got {digest}"
        )
    words = tuple(raw.decode("utf-8").splitlines())
    if len(words) != 1 << WORDS_BITS or len(set(words)) != len(words):
        raise VKEncryptError("VKEncrypt dictionary must contain 8192 unique entries")
    return words


RU_WORDS_DICTIONARY = _load_words_dictionary()
RU_WORDS_INDEX = {word: index for index, word in enumerate(RU_WORDS_DICTIONARY)}


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


def is_words_dictionary_text(text: str) -> bool:
    words = str(text or "").strip().split()
    return bool(words) and len(words) <= WORDS_MAX_WORDS and all(word in RU_WORDS_INDEX for word in words)


def _encode_bytes_to_words(value: bytes) -> str:
    source = len(value).to_bytes(4, "big") + value
    words: list[str] = []
    accumulator = 0
    bit_count = 0
    for byte in source:
        accumulator = (accumulator << 8) | byte
        bit_count += 8
        while bit_count >= WORDS_BITS:
            bit_count -= WORDS_BITS
            words.append(RU_WORDS_DICTIONARY[(accumulator >> bit_count) & 0x1FFF])
            accumulator = accumulator & ((1 << bit_count) - 1) if bit_count else 0
    if bit_count:
        words.append(RU_WORDS_DICTIONARY[(accumulator << (WORDS_BITS - bit_count)) & 0x1FFF])
    return " ".join(words)


def _decode_words_to_bytes(text: str) -> bytes:
    words = str(text or "").strip().split()
    if not words or len(words) > WORDS_MAX_WORDS:
        raise VKEncryptError("Invalid number of dictionary words")

    output = bytearray()
    accumulator = 0
    bit_count = 0
    for word in words:
        try:
            index = RU_WORDS_INDEX[word]
        except KeyError as exc:
            raise VKEncryptError("Word is not present in the VKEncrypt dictionary") from exc
        accumulator = (accumulator << WORDS_BITS) | index
        bit_count += WORDS_BITS
        while bit_count >= 8:
            bit_count -= 8
            output.append((accumulator >> bit_count) & 0xFF)
            accumulator = accumulator & ((1 << bit_count) - 1) if bit_count else 0

    if bit_count and accumulator:
        raise VKEncryptError("Non-zero dictionary padding bits")
    if len(output) < 4:
        raise VKEncryptError("Dictionary payload is too short")
    expected_length = int.from_bytes(output[:4], "big") + 4
    if len(output) < expected_length:
        raise VKEncryptError("Invalid dictionary payload length")
    if any(output[expected_length:]):
        raise VKEncryptError("Non-zero bytes after dictionary payload")
    return bytes(output[4:expected_length])


def _parse_words_packet(packet: bytes, key_id: str) -> ParsedWordPacket:
    if len(packet) < WORDS_PACKET_HEADER_LEN:
        raise VKEncryptError("Dictionary packet is too short")
    if packet[:4] != WORDS_PACKET_MAGIC:
        raise VKEncryptError("Unknown dictionary packet version")
    if packet[4] != 1 or packet[6] != 1 or packet[7] != 1:
        raise VKEncryptError("Incompatible dictionary packet")

    payload_length = int.from_bytes(packet[28:32], "big")
    if payload_length != len(packet) - WORDS_PACKET_HEADER_LEN:
        raise VKEncryptError("Broken dictionary packet length")
    if payload_length > WORDS_MAX_PACKET_BYTES:
        raise VKEncryptError("Dictionary packet is too large")

    part_index = int.from_bytes(packet[20:22], "big")
    part_count = int.from_bytes(packet[22:24], "big")
    total_plaintext_length = int.from_bytes(packet[24:28], "big")
    if not part_count or part_index >= part_count:
        raise VKEncryptError("Invalid dictionary packet numbering")
    if total_plaintext_length > WORDS_MAX_PLAINTEXT_BYTES:
        raise VKEncryptError("Dictionary plaintext is too large")

    return ParsedWordPacket(
        key_id=key_id,
        compressed=bool(packet[5] & 1),
        group_id=packet[8:20].hex(),
        part_index=part_index,
        part_count=part_count,
        total_plaintext_length=total_plaintext_length,
        payload=packet[WORDS_PACKET_HEADER_LEN:],
    )


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


def _encrypt_binary_payload(value: bytes, key_hex: str) -> bytes:
    key = bytes.fromhex(_normalize_key_hex(key_hex))
    iv = os.urandom(AES_IV_BYTES)
    return iv + _aes_encrypt(key, iv, value)


def _decrypt_word_packet(text: str, key_id: str, key_hex: str) -> ParsedWordPacket:
    encrypted = _decode_words_to_bytes(text)
    if len(encrypted) < AES_IV_BYTES + AES_TAG_BYTES:
        raise VKEncryptError("Dictionary ciphertext is too short")
    key = bytes.fromhex(_normalize_key_hex(key_hex))
    packet = _aes_decrypt(key, encrypted[:AES_IV_BYTES], encrypted[AES_IV_BYTES:])
    return _parse_words_packet(packet, key_id)


def _build_words_packet(payload: bytes, *, compressed: bool, group_id: bytes, part_index: int, part_count: int, total_plaintext_length: int) -> bytes:
    if len(group_id) != WORDS_GROUP_ID_LEN:
        raise VKEncryptError("Dictionary group id must contain 12 bytes")
    if not 0 <= part_index < part_count <= 0xFFFF:
        raise VKEncryptError("Invalid dictionary packet numbering")
    if not 0 <= total_plaintext_length <= 0xFFFFFFFF:
        raise VKEncryptError("Invalid dictionary plaintext length")
    if len(payload) > WORDS_MAX_PACKET_BYTES:
        raise VKEncryptError("Dictionary packet is too large")

    packet = bytearray(WORDS_PACKET_HEADER_LEN + len(payload))
    packet[:4] = WORDS_PACKET_MAGIC
    packet[4] = 1
    packet[5] = 1 if compressed else 0
    packet[6] = 1
    packet[7] = 1
    packet[8:20] = group_id
    packet[20:22] = part_index.to_bytes(2, "big")
    packet[22:24] = part_count.to_bytes(2, "big")
    packet[24:28] = total_plaintext_length.to_bytes(4, "big")
    packet[28:32] = len(payload).to_bytes(4, "big")
    packet[WORDS_PACKET_HEADER_LEN:] = payload
    return bytes(packet)


def _compress_word_transport(value: bytes) -> tuple[bytes, bool]:
    compressed = gzip.compress(value, mtime=0)
    return (compressed, True) if len(compressed) < len(value) else (value, False)


def _decompress_word_transport(value: bytes) -> bytes:
    try:
        return gzip.decompress(value)
    except (OSError, EOFError) as exc:
        raise VKEncryptError("Invalid gzip dictionary payload") from exc


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


def _build_words_message(
    payload: bytes,
    *,
    compressed: bool,
    group_id: bytes,
    part_index: int,
    part_count: int,
    total_plaintext_length: int,
    key_hex: str,
) -> str:
    packet = _build_words_packet(
        payload,
        compressed=compressed,
        group_id=group_id,
        part_index=part_index,
        part_count=part_count,
        total_plaintext_length=total_plaintext_length,
    )
    return _encode_bytes_to_words(_encrypt_binary_payload(packet, key_hex))


def _fit_words_chunk(
    payload: bytes,
    start: int,
    *,
    compressed: bool,
    group_id: bytes,
    part_count: int,
    total_plaintext_length: int,
    key_hex: str,
    max_raw_chunk: int,
    max_length: int,
) -> int:
    upper = min(max_raw_chunk, len(payload) - start)
    for size in range(upper, 0, -1):
        candidate = _build_words_message(
            payload[start : start + size],
            compressed=compressed,
            group_id=group_id,
            part_index=0,
            part_count=part_count,
            total_plaintext_length=total_plaintext_length,
            key_hex=key_hex,
        )
        if utf16_length(candidate) <= max_length:
            return size
    raise VKEncryptError("Even the smallest dictionary part exceeds the VK limit")


def _encode_word_messages(text: str, key_hex: str, max_length: int) -> list[str]:
    plain_bytes = str(text).encode("utf-8")
    if not plain_bytes:
        return []
    transport, compressed = _compress_word_transport(plain_bytes)
    group_id = os.urandom(WORDS_GROUP_ID_LEN)
    max_raw_chunk = 1200

    for _ in range(32):
        if max_raw_chunk <= 0:
            break
        part_count = max(1, (len(transport) + max_raw_chunk - 1) // max_raw_chunk)
        chunks: list[bytes] = []

        for _ in range(4):
            chunks = []
            offset = 0
            while offset < len(transport):
                size = _fit_words_chunk(
                    transport,
                    offset,
                    compressed=compressed,
                    group_id=group_id,
                    part_count=part_count,
                    total_plaintext_length=len(plain_bytes),
                    key_hex=key_hex,
                    max_raw_chunk=max_raw_chunk,
                    max_length=max_length,
                )
                chunks.append(transport[offset : offset + size])
                offset += size
            if len(chunks) == part_count:
                break
            part_count = len(chunks)

        messages = [
            _build_words_message(
                chunk,
                compressed=compressed,
                group_id=group_id,
                part_index=index,
                part_count=len(chunks),
                total_plaintext_length=len(plain_bytes),
                key_hex=key_hex,
            )
            for index, chunk in enumerate(chunks)
        ]
        if messages and all(utf16_length(message) <= max_length for message in messages):
            return messages
        max_raw_chunk -= 32

    raise VKEncryptError("Could not safely split the dictionary message")


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
        self.word_groups: dict[tuple[str, str, str], _WordGroup] = {}

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

    def _purge_word_groups(self) -> None:
        now = time.time()
        expired = [key for key, group in self.word_groups.items() if group.expires_at <= now]
        for key in expired:
            self.word_groups.pop(key, None)

    def _accept_word_fragment(
        self,
        peer_id: object,
        packet: ParsedWordPacket,
        account_id: str,
    ) -> DecryptedText | PendingWordFragment:
        self._purge_word_groups()
        session_key = self._session_key(account_id, peer_id)
        self.sessions[session_key] = (packet.key_id, "words")
        group_key = (*session_key, packet.group_id)
        group = self.word_groups.get(group_key)
        if group is None:
            group = _WordGroup(
                key_id=packet.key_id,
                compressed=packet.compressed,
                part_count=packet.part_count,
                total_plaintext_length=packet.total_plaintext_length,
                parts={},
                expires_at=time.time() + WORDS_GROUP_TTL_SECONDS,
            )
            self.word_groups[group_key] = group
        elif (
            group.key_id != packet.key_id
            or group.compressed != packet.compressed
            or group.part_count != packet.part_count
            or group.total_plaintext_length != packet.total_plaintext_length
        ):
            self.word_groups.pop(group_key, None)
            raise VKEncryptError("Dictionary fragments have inconsistent metadata")

        group.parts[packet.part_index] = packet.payload
        if len(group.parts) < group.part_count:
            return PendingWordFragment(
                key_id=packet.key_id,
                codec="words",
                group_id=packet.group_id,
                part_index=packet.part_index,
                part_count=packet.part_count,
                received_count=len(group.parts),
            )

        payload = b"".join(group.parts[index] for index in range(group.part_count))
        plain_bytes = _decompress_word_transport(payload) if group.compressed else payload
        if len(plain_bytes) != group.total_plaintext_length:
            self.word_groups.pop(group_key, None)
            raise VKEncryptError("Dictionary plaintext length mismatch")
        self.word_groups.pop(group_key, None)
        return DecryptedText(plain_bytes.decode("utf-8"), packet.key_id, "words")

    def decrypt_inbound(
        self, peer_id: object, text: str, account_id: str = "default"
    ) -> Optional[DecryptedText | PendingWordFragment]:
        if not self.enabled or not isinstance(text, str):
            return None
        result = decrypt_text(text, self.keys)
        if result:
            self.sessions[self._session_key(account_id, peer_id)] = (result.key_id, result.codec)
            return result

        if not is_words_dictionary_text(text):
            return None
        failures: list[str] = []
        for key_id, key_hex in self.keys.items():
            try:
                packet = _decrypt_word_packet(text, key_id, key_hex)
                return self._accept_word_fragment(peer_id, packet, account_id)
            except Exception as exc:
                failures.append(type(exc).__name__)
                continue
        logger.info(
            "VKEncrypt: dictionary candidate rejected peer=%s words=%s failures=%s",
            peer_id,
            len(str(text).split()),
            ",".join(failures) or "none",
        )
        return None

    def encrypt_outbound(self, peer_id: object, text: str, account_id: str = "default") -> str:
        session = self.sessions.get(self._session_key(account_id, peer_id))
        if not session:
            if self.require_session:
                raise NoEncryptedSession(f"No VKEncrypt session for peer {peer_id}")
            return str(text)
        key_id, codec = session
        if codec == "words":
            messages = _encode_word_messages(text, self.keys[key_id], 4096)
            if len(messages) != 1:
                raise VKEncryptError("Dictionary reply requires multiple VK messages")
            return messages[0]
        return encrypt_text(text, self.keys[key_id], key_id, codec)

    def encrypted_chunks(self, peer_id: object, text: str, max_length: int, account_id: str = "default") -> list[str]:
        if not text:
            return []
        session = self.sessions.get(self._session_key(account_id, peer_id))
        if session and session[1] == "words":
            return _encode_word_messages(text, self.keys[session[0]], max_length)

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
