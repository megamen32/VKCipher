# Upstream

This directory vendors [web3blind/hermes-vk-platform](https://github.com/web3blind/hermes-vk-platform).

- License: MIT, preserved in `LICENSE`.
- Imported commit: `2f57f57` (2026-07-17), latest commit inspected on 2026-08-01.
- Selection: native Hermes plugin, stdlib-only VK HTTP, 37 tests, allowlists, retries, Long Poll dedupe, inbound/outbound media and voice support.
- Not selected: `bason95/hermes-vk-bridge` is a subprocess/CLI bridge; `dolgof/hermes-vk-plugin` has no checked-in tests and logs pairing codes.

Local changes in this repository are deliberately kept in separate files or small patches so upstream updates can be compared and reapplied.
