# Task: Add Hermes web settings for VKEncrypt

Status: active
Original request: "в веб-морде Hermes добавить галочку отвечать/не отвечать на незашифрованные сообщения и возможность изменить seed"

## Objective

Expose VKEncrypt plaintext policy and seed rotation through the existing Hermes VK settings UI, without requiring manual file edits or exposing the seed in logs.

## Business canary

In Hermes web settings, the VK platform shows a plaintext-response toggle and a masked seed field; saving them changes the plugin configuration used after gateway reload/restart.

## Scope and exclusions

- Inspect the actual Hermes plugin configuration contract and current VK adapter.
- Change only VKEncrypt plugin metadata/setup/config handling and focused tests/docs.
- Do not mutate or restart live server-100 Hermes until explicitly requested.
- Do not print, fetch, or commit the live seed/token.

## Estimate

Initial active-minute estimate (immutable): optimistic 20, likely 40, pessimistic 75.

## Acceptance

- UI has a clear `Respond to unencrypted messages` checkbox, default off.
- UI has a masked `VKEncrypt seed` input with save/update behavior.
- Saved values map to the adapter's effective `VK_ENCRYPT_ALLOW_PLAINTEXT` and seed source.
- Tests prove fail-closed default, toggle mapping, and seed update without secret output.

## Initial plan (Russian)

1. Проверить web-settings contract Hermes и текущую регистрацию VK-плагина.
2. Написать красный тест UI/config mapping.
3. Добавить поля, сохранение seed и отображение статуса без секрета.
4. Прогнать тесты, задокументировать reload/restart и запушить main.

## Execution notes (English)

- Added plugin metadata registration for Hermes Channels: masked seed/key fields
  plus boolean plaintext-response policy.
- Direct `VK_ENCRYPT_SEED` / `VK_ENCRYPT_KEY` now override configured secret files;
  added regression coverage for seed rotation.
- Patched Hermes web API/UI to carry `input_type`, preserve boolean values, render
  the policy as a switch, and save `true`/`false`; added frontend and backend tests.
- Verified Hermes UI test: 8 passed; desktop TypeScript check passed.
- Verified VKEncrypt crypto tests: 14 passed; plugin syntax and diff checks passed.
- Local Hermes Python endpoint test is not runnable in this checkout because its
  test conftest imports missing `httpx`; no product assertion failed.
- Live server-100 plugin/core installation and gateway restart remain pending
  explicit authorization; current live gateway was already stopped by an unrelated
  WhatsApp dependency failure, so no restart was attempted.

## Follow-up execution (2026-08-12)

- Diagnosed iPhone word failure: `dev` was 5.5.1 and its update URL pointed to
  stale `megamen32/vkencrypt/master` 5.2.0; `master` has no word dictionary.
- Made word transport independent of `CompressionStream`/`DecompressionStream`
  for older iPhone WebKit; bumped userscript/package to 5.6.1.
- Added compatibility/artifact regression tests; Node package tests 10/10 and
  crypto tests 14/14 passed. Playwright browser tests remain blocked because
  local Chromium is not installed.
- Pushed VKCipher `main` and `dev` to `2558c3b465efec00` (verified with direct
  `git ls-remote`); `master` intentionally remains the old compatibility branch.
- Applied Hermes source commits to active server worktree as `e7e3fb5ec`, backed
  up under `~/.hermes/rollbacks/vkencrypt-hermes-ui-20260812-184004`, installed
  VK runtime files, rebuilt web bundle, restarted gateway PID 25990.
- Live backend catalog canary: seed is masked text, plaintext policy is boolean,
  default unset/false; gateway active. Dashboard proxy `127.0.0.1:8787` still
  returns 502, so rendered browser canary is not claimed.
