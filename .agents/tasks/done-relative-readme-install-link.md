# Task: Make README install links branch-relative

Status: complete
Original request: "А можно сделать как-то у GitHub'е ссылки относительными в ридми, чтобы в каждом бранче при нажатии на клавишу «Установить в TemperMonkey он бы открывал бы локальную версию скрипта?"

## Objective

Replace hardcoded install URLs in the root README with GitHub branch-relative
raw links so each branch installs its own `extension/vkencrypt.user.js`.

## Business canary

For `main`, `dev`, and `master`, the branch-relative target resolves to HTTP 200
`text/plain` raw userscript content.

## Scope and exclusions

- Edit only the root README install links and task/self-improve records.
- Do not change userscript metadata, runtime behavior, or unrelated worktree files.
- Do not stage `.claude/`, `CLAUDE.md`, or `graphify-out/`.

## Estimate

Initial active-minute estimate (immutable): optimistic 5, likely 10, pessimistic 20.

## Acceptance

- All root README install links use `./extension/vkencrypt.user.js?raw=1`.
- Branch URL checks return raw `text/plain` for `main`, `dev`, and `master`.
- Commit is pushed to `origin/main`.

## Progress

### Initial plan (Russian)

1. Проверить текущие hardcoded ссылки.
2. Заменить их на branch-relative `?raw=1` ссылки.
3. Проверить raw redirect для каждой ветки.
4. Закоммитить и запушить в `main`.

### Execution notes (English)

- Replaced all three root README install links.
- Verified `main`, `dev`, and `master` resolve to HTTP 200 `text/plain` raw userscripts.
- Commit `864b990` pushed to `origin/main`.
