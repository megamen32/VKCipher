# Task: Explain Hermes VKEncrypt installation and key setup

Status: complete
Original request: "как отдельно в гермесе установить ... есть ли one-liner/README ... как задать ключ"

## Objective

Provide verified standalone Hermes installation and key-configuration instructions, including actual server-100 paths and UI limitations.

## Business canary

A user can install the VK plugin, set a seed/key without exposing it, restart Hermes if required, and verify the plugin is loaded.

## Scope and exclusions

- Inspect existing VKEncrypt Hermes adapter, installer, README, and server-100 config.
- Do not change Hermes configuration or restart services without explicit request.
- Do not print or copy any token, seed, cookie, or private key.

## Estimate

Initial active-minute estimate (immutable): optimistic 8, likely 15, pessimistic 25.

## Acceptance

- Exact one-liner or file-based install path verified.
- Exact key setting location/command verified without secret output.
- README/UI availability and required restart/reload behavior stated.

## Initial plan (Russian)

1. Прочитать адаптер, установщик и README.
2. Проверить фактические пути и конфиг Hermes на сервере-100.
3. Сопоставить способ задания ключа и проверку загрузки.
4. Дать короткую безопасную инструкцию.

## Execution notes (English)

- Repository README: `integrations/hermes-vk-platform/README.md`; installed copy also exists at `/home/roomhacker/.hermes/plugins/vk/README.md`.
- Verified server-100 plugin path `/home/roomhacker/.hermes/plugins/vk`, plugin YAML/README present, and `vk-platform` enabled.
- Verified encryption configuration names: `VK_ENCRYPT_SEED_FILE`, `VK_ENCRYPT_SEED`, `VK_ENCRYPT_KEY_FILE`, and `VK_ENCRYPT_KEY`. Setup helper currently does not prompt for these optional encryption fields, so UI omission is expected.
- Verified `/home/roomhacker/.hermes/vkencrypt-vk.seed` exists with mode `600`; value was not read or printed.
- Gateway is currently failed/stopped due a separate WhatsApp dependency error on `127.0.0.1:30100`; no restart or configuration mutation was performed.
- Final response provides the integrated install one-liner, secure seed-file setup, `VK_ENCRYPT_SEED_FILE` wiring, restart/check commands, and distinction between upstream non-encrypted plugin and VKEncrypt-integrated copy.
