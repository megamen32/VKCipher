# Task: Hermes VK Integration Discovery

## Before Start

Description: Identify which Hermes the operator means, determine whether VK support already exists, and define the smallest safe integration path for VKEncrypt.
Severity: CORE
workflow: explore(canonical Hermes + VK support) -> advise(integration levels) -> review(risks/licence/security) -> lead(handoff)
estimated min-max complete time: (15, 45 minutes)
Acceptance: canonical project identified with source links; VK support and extension points verified; MVP/balanced/ultimate options compared; no repository integration made without a confirmed target boundary.

## On Start

started (UTC+3): 2026-08-01T04:55:26+03:00
Executor: L (Lead)
PID: 70972
Harness: codex
session identifier: 019ecd49-e250-70d3-80ec-9cc207a67f92
Next action: record verified discovery, review risks, and hand off implementation choice.

## Message layer

## Notes

Discovery is user-directed exception because no ROADMAP.md existed. Current VKEncrypt v5.5.1 remains unchanged until Hermes target is confirmed.

Evidence:

- Canonical target: [NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent), MIT licensed.
- Official platform list covers Telegram, Discord, Slack, WhatsApp, Signal and other adapters; no first-party VKontakte adapter was found.
- Official extension point: `~/.hermes/plugins/<name>/plugin.yaml` plus `adapter.py`; implement `BasePlatformAdapter`, register with `ctx.register_platform(...)`, and forward inbound events through `handle_message(...)`.
- Official guidance recommends a plugin for community adapters instead of changing Hermes core. Plugins run in-process with agent privileges, so third-party code requires source/dependency review.
- Community candidates found: [dolgof/hermes-vk-plugin](https://github.com/dolgof/hermes-vk-plugin), [web3blind/hermes-vk-platform](https://github.com/web3blind/hermes-vk-platform), and [bason95/hermes-vk-bridge](https://github.com/bason95/hermes-vk-bridge). None is upstream-approved or live-tested here.
- Existing VKEncrypt bot boundary is `bot/node/` middleware for `vk-io`; it is text-only and its OpenClaw patch is not a Hermes adapter.

Recommended architecture: a standalone Hermes VK plugin owns VK Long Poll/API and account authentication; a separate, least-privilege VKEncrypt crypto bridge owns per-account/per-peer decrypt/encrypt state. Start with text, fail closed when no encrypted session exists, keep tokens and seeds in mode-600 files, and add media/voice only after text interoperability is stable.

## Blocker

Hermes is not installed locally and no Hermes runtime or VK bot token was available for an end-to-end test. A browser VK session cannot validate the Hermes bot/plugin path.

## When complete

## Result

Discovery complete. Hermes VK support is feasible through an external platform plugin, not by extending a confirmed first-party VK adapter. Use the balanced architecture above; do not reuse `openclaw-vk-encrypt.mjs` as a Hermes integration. Implementation remains queued until the operator confirms Hermes installation/runtime and provides a dedicated VK bot token/test peer.

## Completion checklist

- [x] Canonical Hermes project and license verified.
- [x] VK support and extension API verified.
- [x] Three integration levels and recommendation documented.
- [x] Acceptance evidence recorded in this task file.
- [x] Move `wip-hermes-vk-integration.md` to `done-hermes-vk-integration.md` and commit.

Integration levels:

1. MVP: standalone VK Long Poll process plus Hermes text bridge; fastest, but weaker lifecycle and retry semantics.
2. Balanced (recommended): native Hermes platform plugin plus isolated VKEncrypt crypto bridge, per-peer sessions, restart/retry tests, and fail-closed encrypted delivery.
3. Ultimate: first-class reviewed Hermes adapter with persistent sessions, key rotation/revocation, media/voice, capability health checks, and live interoperability/security tests.
