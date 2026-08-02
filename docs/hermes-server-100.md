# Hermes server-100 operations map

This is the canonical map for the Hermes installation on `roomhacker-server-100`.
The deployed entrypoint is:

`/home/roomhacker/.hermes/ops/README.md`

Verified on 2026-08-02. The map points to live paths; it does not move them into
`ops/`. Relative links below resolve from the deployed `ops/README.md`.

## Installation and configuration

- [Hermes home](..): `/home/roomhacker/.hermes`
- [Active config symlink](../config.yaml): `/home/roomhacker/.hermes/config.yaml`
- [Resolved runtime config](../../agents-projects/hermes-config/runtime/config.yaml): `/home/roomhacker/agents-projects/hermes-config/runtime/config.yaml`
- [Protected environment](../.env): `/home/roomhacker/.hermes/.env` (secret values; never print or commit)
- [Environment backups](..): files named `.env.bak.*` in the Hermes home
- [Config backups](..): files named `config.yaml.bak.*` and `config.yaml.dcg-*` in the Hermes home
- [Protected auth state](../auth.json): `/home/roomhacker/.hermes/auth.json`
- [Protected secrets directory](../secrets/): `/home/roomhacker/.hermes/secrets/`
- [Protected VKEncrypt seed](../vkencrypt-vk.seed): `/home/roomhacker/.hermes/vkencrypt-vk.seed`

The config symlink and all secret paths are intentionally kept in their current
locations. This document contains no token, cookie, seed, or private config value.

## Services and runtime

- [Dashboard unit](../../.config/systemd/user/hermes-dashboard.service): user service
- [Gateway unit](../../.config/systemd/user/hermes-gateway.service): user service
- Hermes executable: `/home/roomhacker/.local/bin/hermes`
- Hermes virtualenv: `/home/roomhacker/.hermes/hermes-agent/venv/`
- Hermes source/runtime checkout: `/home/roomhacker/.hermes/hermes-agent/`
- Local VKEncrypt source mirror: [server mirror](../../apps/vkencrypt/), `/home/roomhacker/apps/vkencrypt`

Verified state at inventory time: both `hermes-dashboard.service` and
`hermes-gateway.service` were active. The gateway main PID and start timestamp
are intentionally not treated as stable configuration.

## Enabled platforms and plugins

The following were enabled by `hermes plugins list --enabled`:

| Name | Kind | Location or note |
| --- | --- | --- |
| `minimax-provider` | bundled provider | Hermes bundled plugin registry |
| `openai-codex-provider` | bundled provider | Hermes bundled plugin registry |
| `opencode-zen-provider` | bundled provider | Hermes bundled plugin registry |
| `homeassistant-platform` | bundled adapter | Hermes bundled plugin registry |
| `matrix-platform` | bundled adapter | Hermes bundled plugin registry |
| `telegram-platform` | bundled adapter | Hermes bundled plugin registry |
| `web-ddgs` | bundled provider | Hermes bundled plugin registry |
| `agent-heartbeat` | user plugin | [plugin](../plugins/agent-heartbeat/) |
| `delivery-router` | user plugin/sink | [symlink](../plugins/delivery-router) |
| `last-human-commit` | user plugin | [plugin](../plugins/last-human-commit/) |
| `vk-platform` | user adapter | [VK plugin](../plugins/vk/) |

The `*.prev-*` directories under [plugins](../plugins/) are retained historical
copies, not active adapters. Use Hermes' plugin list as the source of truth for
enabled state rather than inferring it from directory names.

## VK adapter and VKEncrypt

- [Active plugin](../plugins/vk/): `/home/roomhacker/.hermes/plugins/vk`
- [Plugin manifest](../plugins/vk/plugin.yaml): discovery and plugin metadata
- [VK adapter](../plugins/vk/adapter.py): Long Poll, allowlists, media, replies
- [VKEncrypt bridge](../plugins/vk/vkencrypt.py): text envelope and codecs
- [Russian-word dictionary](../plugins/vk/ru-common-8192-v4.txt): transport dictionary
- [Plugin setup helper](../plugins/vk/setup_helper.py)
- [Plugin README](../plugins/vk/README.md)
- [Plugin development notes](../plugins/vk/docs/development.md)
- [Plugin troubleshooting](../plugins/vk/docs/troubleshooting.md)
- [Plugin tests](../plugins/vk/tests/)
- [Current plugin backup](../plugin-backups/vk.backup.20260802054210/)

The repository source for this plugin is:

`/Users/user/Documents/Codex/2026-06-16/megamen32-vkencrypt-https-github-com-megamen32/work/vkencrypt/integrations/hermes-vk-platform`

The server mirror is `/home/roomhacker/apps/vkencrypt`. Keep the repository
source canonical; deploy with the existing installer rather than editing the
live plugin by hand.

## Runtime data and diagnostics

- [Gateway and dashboard logs](../logs/): `/home/roomhacker/.hermes/logs`
- [Gateway log](../logs/gateway.log)
- [VK polling bridge log](../logs/vk_polling_bridge.log)
- [Session/request dumps](../sessions/): `/home/roomhacker/.hermes/sessions`
- [Persistent state](../state/): `/home/roomhacker/.hermes/state`
- [State database](../state.db): `/home/roomhacker/.hermes/state.db`
- [General cache](../cache/): `/home/roomhacker/.hermes/cache`
- [Audio cache](../audio_cache/): `/home/roomhacker/.hermes/audio_cache`
- [Image cache](../image_cache/): `/home/roomhacker/.hermes/image_cache`
- [Platform state](../platforms/): `/home/roomhacker/.hermes/platforms`
- [Gateway state](../gateway_state.json): `/home/roomhacker/.hermes/gateway_state.json`
- [Channel directory](../channel_directory.json): `/home/roomhacker/.hermes/channel_directory.json`
- [Cron](../cron/): `/home/roomhacker/.hermes/cron`
- [Pairing](../pairing/): `/home/roomhacker/.hermes/pairing`
- [Pending messages](../pending_messages/): `/home/roomhacker/.hermes/pending_messages`
- [Skills](../skills/): `/home/roomhacker/.hermes/skills`
- [Backups](../backups/): `/home/roomhacker/.hermes/backups`
- [Hooks](../hooks/): `/home/roomhacker/.hermes/hooks`
- [Hermes scripts](../scripts/): `/home/roomhacker/.hermes/scripts`

Logs, sessions, caches, and databases can contain private messages or prompts.
Do not copy them into this repository or attach them to bug reports without
redaction.

## Safe operations

Run these as `roomhacker` on server-100:

```bash
hermes plugins list --enabled
systemctl --user status hermes-gateway.service hermes-dashboard.service
journalctl --user -u hermes-gateway.service --since today --no-pager
grep -i 'VK:' ~/.hermes/logs/gateway.log | tail -80
```

For a source update from this repository:

```bash
cd /Users/user/Documents/Codex/2026-06-16/megamen32-vkencrypt-https-github-com-megamen32/work/vkencrypt
HERMES_HOME=/home/roomhacker/.hermes ./scripts/install-hermes-vk-plugin.sh
```

The installer moves an existing VK plugin to `~/.hermes/plugin-backups/` before
installing the new copy. Restart the gateway only after reviewing the backup and
the plugin tests.

Never run `source ~/.hermes/.env`, print the environment, or paste any secret
file into a terminal transcript. Use the setup helper or an editor that preserves
permissions for secret changes.

## Updating this map

The repository file is canonical:

`docs/hermes-server-100.md`

After a verified change to the installation layout, deploy the sanitized copy:

```bash
ssh 192.168.2.100 'mkdir -p ~/.hermes/ops && chmod 700 ~/.hermes/ops'
scp docs/hermes-server-100.md 192.168.2.100:/home/roomhacker/.hermes/ops/README.md
ssh 192.168.2.100 'chmod 600 ~/.hermes/ops/README.md'
```

Do not add secrets, message contents, cookies, tokens, seed contents, or raw
`.env`/database/log dumps to this document.
