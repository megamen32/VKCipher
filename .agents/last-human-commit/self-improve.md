## 2026-08-02 — Hermes VK silent reply (diagnosis)

- What slowed or confused L? Browser screenshot preceded the async reply; API history was stale versus the live page.
- Which instruction should change? none
- Which skill, MCP, or tool is missing? BrowserOS should expose stable message IDs/timestamps for live chat assertions.
- What operation or error repeated? 1 unsafe `.env` source warning avoided by raw-line token parsing; prefer a reusable secret-safe diagnostic helper.
- State: Proposed

## 2026-08-02 — Hermes Russian-word codec assessment (diagnosis)

- What slowed or confused L? Existing `graphify-out/` lacked `graph.json`; direct source inspection was needed.
- Which instruction should change? none
- Which skill, MCP, or tool is missing? none
- What operation or error repeated? none
- State: not actionable

## 2026-08-02 — Hermes Russian-word codec (deployment)

- What slowed or confused L? Plugin backup under `~/.hermes/plugins` was discovered as a second old plugin; startup used stale code despite current source hash.
- Which instruction should change? `scripts/install-hermes-vk-plugin.sh`: store backups outside plugin discovery root; fixed now.
- Which skill, MCP, or tool is missing? none
- What operation or error repeated? 2 deploy/restart cycles before startup logged `dictionary=ru-common-8192-v4`; add post-deploy module/version canary.
- State: fixed now
