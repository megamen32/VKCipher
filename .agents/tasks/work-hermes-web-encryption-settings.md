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
