# Roadmap

## Proposed

- Hermes VK integration discovery and adapter proposal.
  Scope: identify the canonical Hermes project, verify its extension/plugin API and VK channel support, then propose an isolated VK adapter for VKEncrypt.
  May delay: implementation would take priority over later Max/Telegram/media expansion; discovery does not delay current VK maintenance.
  Status: implementation complete for vendored plugin and text crypto; plugin enabled on server-100, live VK test pending dedicated bot token and test peer.

## Current

- VKEncrypt v5.5.1 maintenance and release follow-up.
- Hermes VK plugin integration: vendored adapter, text VKEncrypt bridge, and installer complete; live deployment is gated by a fresh dedicated VK bot test boundary.
