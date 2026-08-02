# Russian-word transport dictionary

`ru-common-8192-v4.txt` is the current Russian-word transport dictionary for
VKEncrypt. It changes only how an authenticated encrypted payload is carried
through VK text messages. It does not replace AES-256-GCM and it is not a
password dictionary.

## Current artifact

- File: `ru-common-8192-v4.txt`
- Entries: `8192` unique words
- Alphabet: lowercase Cyrillic `а-яё`
- Minimum word length: 2 Unicode characters
- Format: UTF-8, LF, one word per line
- Information per word: `13` bits (`8192 = 2^13`)
- SHA-256: `d6ce1bca2d8715a390842773d65a88b643e9f95bec6e9e4eda7b81c0aa88a2a4`

The file order is part of the wire format. Every word's zero-based position is
its 13-bit value. Reordering or replacing words changes the codec and makes
messages produced with the old file undecodable.

The Hermes VK adapter carries the same bytes at:

`integrations/hermes-vk-platform/ru-common-8192-v4.txt`

The two files must have the same SHA-256 before a userscript/Hermes deployment.

## How it is built

The builder intersects two real sources, removes the exact denylist, preserves
frequency order, and takes the first 8192 results:

```text
arena/sources/frequencywords/ru_50k.txt
        intersect
arena/sources/hunspell/index.dic
        minus
extension/dictionaries/ru-common-8192-v4-denylist.txt
        -> extension/dictionaries/ru-common-8192-v4.txt
```

Rebuild it with:

```bash
npm run dictionary:build
npm run build
```

`dictionary:build` also regenerates the embedded source
`extension/src/05-dictionary.js`. `npm run build` then refreshes the distributed
userscript. Copy the resulting dictionary to the Hermes plugin only when its
hash is unchanged or the matching codec implementation is deployed together.

The denylist currently removes `258` exact entries from the candidate pool. It
is a filter, not a claim that every remaining word is harmless, invisible, or
safe for every moderation system. The list can still contain ordinary words
that acquire risk from context, repetition, or a user's message history.

## Wire format

1. Plaintext is encoded as UTF-8.
2. Gzip is used only when it makes the transport payload smaller.
3. The payload is split into authenticated `VKW1` packets.
4. Each packet is encrypted with AES-256-GCM using the selected VKEncrypt key.
5. The encrypted bytes are converted to dictionary indexes and joined with
   spaces.

The packet metadata contains the codec version, compression flag, random group
id, part index, part count, plaintext byte length, and payload byte length. A
word-looking message is only accepted after dictionary decoding and successful
AES-GCM authentication with one of the configured keys.

There is intentionally no visible text envelope marker in this transport. A
normal Russian sentence can therefore be considered as a candidate, but it is
discarded when packet parsing or authentication fails.

## Long messages

The browser userscript keeps every outgoing part at or below `4000` UTF-16
units, leaving margin below VK's practical limit. Hermes uses the adapter's
`4096` limit and applies the same adaptive packet sizing. The initial raw chunk
target is `1200` bytes; it is reduced when the encoded packet does not fit.

Parts are reassembled by `(account, peer, group id)` and `part index`. Missing or
duplicate parts do not produce plaintext. Incomplete browser groups expire from
local storage after seven days; Hermes groups expire from process state after
seven days.

## Compatibility rules

- All participants must use dictionary id `ru-common-8192-v4`.
- All participants must use the exact SHA-256 listed above.
- The same seed/key is still required; the dictionary is not a key exchange.
- The userscript, Node middleware, and Hermes adapter use the same packet
  structure and dictionary order.
- A dictionary update requires a new id or a coordinated update on every side.

## Verification

Check the artifact and both copies:

```bash
wc -l extension/dictionaries/ru-common-8192-v4.txt
shasum -a 256 extension/dictionaries/ru-common-8192-v4.txt
cmp extension/dictionaries/ru-common-8192-v4.txt \
    integrations/hermes-vk-platform/ru-common-8192-v4.txt
```

Run the deterministic tests:

```bash
npm run test:dictionary
PYTHONPATH=integrations/hermes-vk-platform \
  python3 -m pytest integrations/hermes-vk-platform/tests/test_vkencrypt.py -q
```

The cross-runtime tests cover dictionary validation, markerless detection,
Node-to-Python packets, Python-to-Node packets, gzip, and multipart
reassembly.
