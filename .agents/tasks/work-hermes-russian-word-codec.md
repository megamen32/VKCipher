# Task: Add Hermes Russian-word VKEncrypt codec

Status: active
Original request: "да" in response to adding Hermes Russian-word transport with auto-detection.

## Objective

Add interoperable Hermes support for the userscript's markerless `VKW1` Russian-word transport, including safe auto-detection, AES-GCM validation, multipart reassembly, and encrypted word-codec replies.

## Business canary

From browser account `46887791` in `autopost-testing`, send a Russian-word encrypted short message and a long message; Hermes must decrypt and reply in Russian words; browser must render both replies as plaintext.

## Confirmed scope

- Port the exact `ru-common-8192-v4` dictionary and packet format to the vendored Hermes plugin.
- Add codec auto-detection guarded by dictionary membership and AES-GCM authentication.
- Add per-peer `words` session replies and multipart assembly.
- Add unit/integration tests and perform a real VK canary after deployment.

## Explicit exclusions

- No default codec switch from Emoji/Cyrillic.
- No seed/token rotation.
- No media, voice, Telegram, Max, or unrelated Hermes dependency changes.
- No changes to the browser userscript protocol.

## Estimate

Initial active-minute estimate (immutable): optimistic 45, likely 90, pessimistic 180.

## Acceptance

- Python round-trip matches the browser's word codec byte-for-byte at the protocol level.
- False-positive natural Russian text is not treated as encrypted.
- Multipart messages reassemble only after all authenticated parts arrive.
- Existing Emoji/Cyrillic Hermes tests remain green.
- Real VK short and long word canaries pass with encrypted Hermes replies.

## Plan selection

- Plan A (selected): port the existing markerless `VKW1` transport and keep it opt-in. Preserves interoperability and current defaults.
- Plan B (rejected): wrap words in a new envelope marker. Adds overhead and diverges from the browser implementation.
- Plan C (rejected): make Hermes words-only. Breaks existing Emoji/Cyrillic sessions and rollback safety.

## Progress

### Initial plan (Russian)

1. Сверить точный протокол userscript и словарь.
2. Реализовать Python-кодек и сборку частей с проверкой AES-GCM.
3. Подключить автоопределение и ответы Hermes с сохранением кодека по peer.
4. Добавить TDD-тесты, выполнить полную проверку и задеплоить только после локального успеха.
5. Прогнать короткую и длинную канарейки в реальном VK.

### Execution notes (English)

Pending.
