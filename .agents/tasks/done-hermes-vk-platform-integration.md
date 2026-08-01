# Task: Integrate third-party Hermes VK plugin

## Before Start

Description: Vendor the strongest reviewed Hermes VK candidate and add VKEncrypt text protection without changing Hermes core.
Severity: CORE
workflow: vendor(web3blind candidate) -> implement(VKEncrypt-compatible text bridge) -> test(Hermes runtime + loopback) -> review(security/config) -> lead(handoff)
estimated min-max complete time: (30, 90 minutes)
Acceptance: vendored MIT source with upstream commit recorded; plugin loads in Hermes 0.19.1; existing candidate tests pass with Hermes runtime; VKEncrypt emoji/cyrillic/base64 text round-trips with the Node middleware; no secrets or live services changed without explicit test boundary.

## On Start

Executor: L (Lead)
Harness: codex
Source: https://github.com/web3blind/hermes-vk-platform
Source commit: 2f57f57 (2026-07-17)
Rejected alternatives: bason95 is a subprocess bridge; dolgof has no tests and logs pairing codes.

## Message layer

## Notes

Hermes is installed on server-100 as v0.19.1. The plugin must be tested against that checkout, not only a standalone local pytest environment.

## Blocker

No dedicated VK community token/test peer is available for a live send/receive test. Do not reuse exposed historical tokens. Plugin installation on server-100 remains intentionally unperformed until that boundary is supplied.

## When complete

## Result

Selected `web3blind/hermes-vk-platform` over the two alternatives and vendored it under `integrations/hermes-vk-platform/`. Added a Python VKEncrypt port compatible with the Node/userscript envelope, per-peer codec sessions, UTF-16-aware encrypted chunking, fail-closed plaintext behavior, owner-only secret-file checks, and explicit unencrypted-media refusal. Added an installer and Hermes documentation.

Evidence:

- Local VKEncrypt tests: 9 passed, including Node <-> Python round trips for Emoji/Cyrillic/Base64, seed derivation, peer session reuse, chunk limits, and secret permissions.
- Hermes 0.19.1 on server-100: vendored adapter `py_compile` passed; original plugin suite passed 37 tests; registration smoke passed; mocked encrypted send/decrypt smoke passed.
- Existing VKEncrypt Node middleware regression: 7 passed.
- No production Hermes files, config, tokens, or services were changed.

## Completion checklist

- [x] Vendor candidate source and preserve MIT license/upstream attribution.
- [x] Add compatible VKEncrypt text bridge with fail-closed configuration.
- [x] Add unit tests for cross-runtime format and session behavior.
- [x] Run candidate tests against Hermes runtime.
- [x] Run plugin registration smoke test against server-100 Hermes source.
- [x] Record live-test blocker and move task to done.
