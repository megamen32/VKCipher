# Task: Assess Hermes Russian-word codec support

Status: complete
Original request: "так вроде работает может мы его на русские слова переведем он умеет автопонимать словарь?"

## Objective

Determine whether Hermes can currently auto-detect and use VKEncrypt's Russian-word transport, and define the smallest safe integration path.

## Business canary

Not run: this task is a compatibility assessment; existing encrypted text canary remains unchanged.

## Confirmed scope

- Inspect the Hermes Python codec and userscript word transport.
- Determine inbound auto-detection and outbound reply support.
- Recommend a compatibility-safe rollout.

## Explicit exclusions

- No production code, server config, token, seed, or default codec changes.
- No live messages sent.

## Estimate

Initial active-minute estimate (immutable): optimistic 5, likely 10, pessimistic 20.

## Acceptance

- Current support and auto-detection behavior stated from source evidence.
- Integration risks and rollout order stated.

## Progress

### Initial plan (Russian)

1. Сопоставить кодеки Hermes и userscript.
2. Проверить наличие словаря, автоопределения и сборки частей.
3. Дать безопасную рекомендацию без смены рабочего режима.

### Execution notes (English)

- Graphify graph was absent; direct source inspection was used without modifying foreign `graphify-out/` state.
- Hermes `integrations/hermes-vk-platform/vkencrypt.py` currently defines only `base64`, `emoji`, and `cyrillic` markers and auto-detects those markers.
- Userscript `extension/src/25-words-transport.js` uses markerless `VKW1` packets encoded with the exact `ru-common-8192-v4` dictionary, gzip metadata, AES-GCM authentication, and multi-part assembly.
- Conclusion: Hermes cannot currently auto-detect or reply in Russian-word transport; porting only the dictionary is insufficient.

### Outcome

Russian-word support is feasible, but should be added as an opt-in codec first: exact dictionary/hash, markerless detection guarded by AES-GCM verification, packet reassembly, then outbound codec/session support and live E2E. Keep Emoji/Cyrillic as fallback until that canary passes.
