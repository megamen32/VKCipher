# Task: Place Hermes operations map in canonical config project

Status: complete
Original request: "а разве не в ~/agents-project надо было куда то кидать все?"

## Objective

Make `~/agents-projects/hermes-config` the canonical home for the Hermes
server-100 operations map; keep VKEncrypt repository free of user-facing Hermes
operations docs.

## Business canary

`/home/roomhacker/agents-projects/hermes-config/ops/README.md` opens, links to
verified Hermes config/plugin/service/runtime areas, and is reachable through
`~/.hermes/ops` without duplicating live state.

## Scope and exclusions

- Add and commit only the config-project documentation files.
- Keep `runtime/.env`, `runtime/config.yaml`, plugins, logs, sessions, and state
  in their existing paths.
- Do not stage or alter existing dirty runtime files or untracked tests.
- Remove the earlier user-facing Hermes map from VKEncrypt.

## Estimate

Initial active-minute estimate (immutable): optimistic 10, likely 15, pessimistic 30.

## Acceptance

- Canonical map lives under `~/agents-projects/hermes-config/ops/`.
- `~/.hermes/ops` is a symlink to that folder.
- Relative link and secret-marker checks pass.
- Config-project commit contains only documentation changes.

## Progress

### Initial plan (Russian)

1. Проверить canonical config project и его dirty state.
2. Переместить только карту документации в `hermes-config/ops`.
3. Убрать пользовательскую копию из VKEncrypt.
4. Проверить ссылки, права и состав коммитов.

### Execution notes (English)

- Confirmed `/home/roomhacker/agents-projects/hermes-config` is the private canonical config repo; its runtime config is the target of `~/.hermes/config.yaml`.
- Added and committed only `README.md` and `ops/README.md` there as commit `efdc5f1`; existing `runtime/.env`, `runtime/config.yaml`, and untracked `tests/` remain untouched.
- Removed the earlier user-facing operations map, README link, and roadmap entry from VKEncrypt.
- Replaced the prior `~/.hermes/ops` directory with a symlink to `~/agents-projects/hermes-config/ops`.
- Verified 39 relative links with `missing_links=0`, `secret_marker_hits=0`, canonical doc mode `600`, ops directory mode `700`, and both Hermes services active.
