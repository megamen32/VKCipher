# Task: Make main canonical and document the Russian dictionary

Status: complete
Original request: "все теперь на main сливаем и пишем новый readme про новый словарь"

## Objective

Ensure the repository's `main` contains the verified current work and add an
accurate root README section describing the new Russian-word transport
dictionary.

## Business canary

`origin/main` and the verified current work are aligned; README explains the
dictionary's file, format, codec selection, detection, limits, and verification
commands without claiming unsupported compatibility.

## Scope and exclusions

- Inspect and merge only the repository branches needed for `main`.
- Update root `README.md` and any required task/self-improve records.
- Do not touch unrelated untracked files or live Hermes runtime state.
- Do not expose seeds, tokens, cookies, or private config values.

## Estimate

Initial active-minute estimate (immutable): optimistic 10, likely 20, pessimistic 35.

## Acceptance

- `main` contains the current verified commit plus the README change.
- README references the actual dictionary path and verified format/statistics.
- Dictionary tests or a deterministic validation command pass.
- Push to `origin/main` completes and remote ref is verified.

## Progress

### Initial plan (Russian)

1. Проверить refs `main/dev` и состояние словаря.
2. Написать README-раздел по фактической реализации.
3. Запустить проверки словаря и тесты.
4. Закоммитить и запушить только в `main`, проверить remote ref.

### Execution notes (English)

- `origin/main` already contained `origin/dev` at `83bfadb`; no merge conflict or extra merge commit was needed.
- Added `extension/dictionaries/README.md` and updated root `README.md` with the current dictionary facts and safety caveat.
- Deterministic validation: 8192 unique valid entries, 0 denylist overlap, matching Hermes copy hash; `npm run test:dictionary` 5/5 and Python cross-runtime suite 13/13.
- Local `main` now contains the README change; unrelated `.claude/`, `CLAUDE.md`, and `graphify-out/` remain untracked and untouched.
