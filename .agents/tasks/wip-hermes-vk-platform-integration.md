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

No dedicated VK community token/test peer is available for a live send/receive test. Do not reuse exposed historical tokens.

## When complete

## Result

Pending implementation.

## Completion checklist

- [ ] Vendor candidate source and preserve MIT license/upstream attribution.
- [ ] Add compatible VKEncrypt text bridge with fail-closed configuration.
- [ ] Add unit tests for cross-runtime format and session behavior.
- [ ] Run candidate tests against Hermes runtime.
- [ ] Run plugin registration smoke test against server-100 Hermes source.
- [ ] Record live-test blocker and move task to done.
