# Task: Centralize Hermes server-100 inventory

Status: complete
Original request: "все конфиги и плагины и адаптеры и тп для хермеса надо собрать в одной папке на сотом или хотя бы там где его конфигируция сделать док с ссылками на все"

## Objective

Create one safe Hermes server-100 operations folder and a maintained document linking configuration, plugins/adapters, services, logs, sessions, backups, runtime, and source without moving live files or exposing secrets.

## Business canary

On server-100, `~/.hermes/ops/README.md` opens and links to every verified Hermes operational area; links resolve or clearly identify secret/protected paths.

## Confirmed scope

- Inventory the actual Hermes home, config, enabled plugins, services, runtime, logs, sessions, backups, and source checkout.
- Add a sanitized repo document and deploy its copy to `~/.hermes/ops/README.md`.
- Verify remote links and file permissions.

## Explicit exclusions

- Do not move, rename, delete, or chmod existing live configs, plugins, sessions, logs, or secrets.
- Do not print or copy tokens, seed contents, cookies, or private configuration values.
- Do not restart Hermes services unless documentation verification requires it.

## Estimate

Initial active-minute estimate (immutable): optimistic 15, likely 25, pessimistic 45.

## Acceptance

- One server-100 operations folder exists.
- The document links to all discovered Hermes operational components using sanitized paths.
- Secret paths are referenced but values are not exposed.
- Remote verification passes and documentation is committed.

## Progress

### Initial plan (Russian)

1. Снять фактический inventory Hermes на server-100 без вывода секретов.
2. Создать поддерживаемый документ и папку `~/.hermes/ops`.
3. Проверить ссылки, permissions и отсутствие изменений рабочих конфигов.
4. Закоммитить документ и зафиксировать результат.

### Execution notes (English)

- Completed sanitized inventory on `roomhacker-server-100`; no secret values were printed.
- Added `docs/hermes-server-100.md` as the repository source of truth and linked it from the VK plugin README and ROADMAP.
- Deployed the same SHA-256 document to `/home/roomhacker/.hermes/ops/README.md`.
- Verified 41 relative links with `missing_links=0`, `secret_marker_hits=0`, directory mode `700`, file mode `600`, and both Hermes services active.
- Existing live configs, plugins, sessions, logs, caches, backups, and services were not moved or restarted.
