# Task: Publish VKEncrypt Hermes as an installable product

Status: complete
Original request: "мой плагин должен быть на гите; one-line installer; README за 30 секунд; картинка и ссылки; менять ключ без настроек"

## Objective

Make the VKEncrypt Hermes adapter discoverable and installable from the official VKCipher GitHub repository, add secret-safe key rotation without Hermes UI, and present a short public README with direct links and visual branding.

## Business canary

From a clean HOME, a user runs the published branch-pinned installer, gets the VKEncrypt plugin, runs the published key manager, and receives a mode-only status without secret output.

## Scope and exclusions

- Change only VKCipher packaging, Hermes installer/key manager, README/docs, version URLs, and focused tests.
- Do not change upstream Hermes or restart the live Hermes gateway.
- Do not print, store, or commit real tokens/seeds.

## Estimate

Initial active-minute estimate (immutable): optimistic 25, likely 45, pessimistic 90.

## Acceptance

- Official `main` GitHub links work immediately without relying on default branch or stale raw CDN behavior.
- One-line installer installs the VKCipher adapter to `~/.hermes/plugins/vk` and backs up an existing plugin.
- Key manager rotates seed or 64-hex key with hidden input, `600` files, mutually exclusive active env mode, and optional restart.
- Root README sells the product in 30 seconds and links browser, Hermes, key manager, docs, and GitHub.
- Tests and real published raw canary pass; main is pushed and clean.

## Initial plan (Russian)

1. Проверить состояние репозитория, upstream lineage и текущий Hermes installer.
2. Написать красный black-box тест для смены seed/key в чистом HOME.
3. Добавить key-manager, branch-pinned one-line installer, README и баннер.
4. Обновить публичные ссылки/версию, прогнать тесты, raw canary и push `main`.

## Execution notes (English)

- Red test failed as expected because `scripts/hermes-vk-key.sh` did not exist.
- Implemented `scripts/hermes-vk-key.sh` (`set-seed`, `set-key`, `status`, optional `--restart`) and branch-aware `scripts/install-hermes-vk-plugin.sh`.
- Updated official GitHub metadata/links, Hermes docs, `5.6.0`, generated userscript, and added `docs/media/hermes-vkencrypt-banner.svg`.
- Tests passed: Hermes installer/key black-box, VK middleware, Chrome package, Firefox/Safari package, dictionary orchestrator, shell syntax, SVG XML, and diff check.
- First raw canary exposed default-branch `master` and stale `raw.githubusercontent.com` behavior; fixed by explicit `--branch main` and `github.com/.../raw/refs/heads/main` links.
- Final published canary passed from clean HOME: plugin installed, seed accepted, seed file mode `600`, no secret output. Commits pushed: `39f2f82`, `0f46315`, `e9d9927`; `main` clean and equal to `origin/main`.
