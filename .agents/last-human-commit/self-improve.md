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

## 2026-08-02 — Hermes server-100 operations map (docs)

- What slowed or confused L? First inventory used BSD `stat` flags on Linux and produced filesystem metadata instead of permissions; reran with `stat -c`.
- Which instruction should change? none
- Which skill, MCP, or tool is missing? none
- What operation or error repeated? 1 quoting failure in remote Markdown-link verification; use a local `ssh ... bash -s` heredoc for multiline checks.
- State: fixed now

## 2026-08-02 — Hermes config-project operations map (correction)

- What slowed or confused L? Initial map was placed in VKEncrypt before checking that `~/.hermes/config.yaml` targets `~/agents-projects/hermes-config/runtime/config.yaml`.
- Which instruction should change? none
- Which skill, MCP, or tool is missing? none
- What operation or error repeated? 1 relocation correction; inspect config symlinks before choosing a documentation root.
- State: fixed now

## 2026-08-02 — VKCipher and Hermes config main push (release)

- What slowed or confused L? VKCipher had no remote `main`, so the target had to be created from verified `HEAD`.
- Which instruction should change? none
- Which skill, MCP, or tool is missing? none
- What operation or error repeated? none; remote refs matched local heads after one push per repository.
- State: fixed now

## 2026-08-02 — Russian dictionary README (documentation)

- What slowed or confused L? Existing root README overstated the word filter as safe; implementation and artifact checks were needed before rewriting it.
- Which instruction should change? none
- Which skill, MCP, or tool is missing? none
- What operation or error repeated? 1 Python test collection failure without `PYTHONPATH`; documented the working cross-runtime command with the package path.
- State: fixed now

## 2026-08-09 — VKEncrypt main push confirmation (release)

- What slowed or confused L? Previous push report was not trusted by the user; current ref proof was needed.
- Which instruction should change? none
- Which skill, MCP, or tool is missing? none
- What operation or error repeated? 1 explicit `git push origin main`; result `Everything up-to-date`, local and remote SHA equal.
- State: fixed now

## 2026-08-09 — Branch-relative README install link (docs)

- What slowed or confused L? GitHub relative links needed an explicit `?raw=1` redirect check; a plain blob link would not be a reliable Tampermonkey input.
- Which instruction should change? none
- Which skill, MCP, or tool is missing? none
- What operation or error repeated? none; one curl matrix verified `main`, `dev`, and `master` as raw `text/plain`.
- State: fixed now

## 2026-08-09 — Server-25 Ollama arena (background)

- What slowed or confused L? Arena was absent on server; local Ollama `/v1` returned reasoning-only output and concurrent 12 GB VRAM loading stalled runs.
- Which instruction should change? none
- Which skill, MCP, or tool is missing? A detached remote-job helper with PID/log/checkpoint polling would reduce manual SSH orchestration.
- What operation or error repeated? 6 local command-construction errors (wrong workdir/inline Python/bash); validate checkout path and shell syntax before SSH and use one fixed remote runner.
- State: fixed now

## 2026-08-09 — Hermes VKEncrypt install/key instructions (docs)

- What slowed or confused L? README documents the seed file, but setup helper omits encryption prompts and the Hermes UI does not expose them.
- Which instruction should change? none
- Which skill, MCP, or tool is missing? none; remote read-only config inventory was sufficient.
- What operation or error repeated? none
- State: fixed now
