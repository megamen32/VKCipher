# Task: Sync main, ignore local artifacts, and place AGENTS guidance

Status: active
Original request: "Всю ветку в main ... в игнор добавь ... в common LHC, в agents-projects нужно добавить AGENTS.md"

## Objective

Confirm all intended VKEncrypt branch work is present in `main`, ignore only
untracked local artifacts explicitly identified by the worktree, and determine
the correct canonical locations for the requested `AGENTS.md` guidance in the
LHC common tree and server `agents-projects` without overwriting foreign files.

## Business canary

`origin/main` contains the full intended branch history; local artifacts no
longer appear as accidental worktree noise; each requested AGENTS location is
identified and updated only with explicit, reviewed content.

## Scope and exclusions

- Inspect `main`, `dev`, `.gitignore`, LHC common paths, and server
  `agents-projects` paths.
- Add ignore rules only for confirmed local artifacts.
- Do not overwrite or delete existing AGENTS/instruction files.
- Do not push secrets, runtime state, or unrelated dirty files.

## Estimate

Initial active-minute estimate (immutable): optimistic 15, likely 30, pessimistic 60.

## Acceptance

- Branch containment and remote `main` are verified.
- Ignore rules are scoped and tested with `git check-ignore`.
- Requested AGENTS targets are confirmed or exact ambiguity is reported.
- Any changes are committed and pushed to the intended `main` only.

## Progress

### Initial plan (Russian)

1. Проверить refs и состав веток.
2. Проверить локальные артефакты и `.gitignore`.
3. Найти canonical AGENTS locations в LHC и agents-projects.
4. Внести безопасный патч, проверить и запушить `main`.

### Execution notes (English)

Pending.
