#!/usr/bin/env bash
set -euo pipefail

repo_url="${VKENCRYPT_REPO_URL:-https://github.com/megamen32/VKCipher.git}"
repo_branch="${VKENCRYPT_REPO_BRANCH:-main}"
script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" 2>/dev/null && pwd || true)
repo_root=$(cd "$script_dir/.." 2>/dev/null && pwd || true)
source_dir="$repo_root/integrations/hermes-vk-platform"
bootstrap_dir=""

# The same script supports a checked-out repo and `curl | bash`.
if [[ ! -f "$source_dir/plugin.yaml" ]]; then
    command -v git >/dev/null 2>&1 || {
        printf 'git is required for the one-line installer\n' >&2
        exit 1
    }
    bootstrap_dir=$(mktemp -d)
    trap 'rm -rf "$bootstrap_dir"' EXIT
    git clone --branch "$repo_branch" --single-branch --depth 1 "$repo_url" "$bootstrap_dir/VKCipher" >/dev/null
    source_dir="$bootstrap_dir/VKCipher/integrations/hermes-vk-platform"
fi
hermes_home="${HERMES_HOME:-$HOME/.hermes}"
plugin_dir="$hermes_home/plugins/vk"
backup_dir="$hermes_home/plugin-backups"

if [[ ! -f "$source_dir/plugin.yaml" ]]; then
    printf 'Missing plugin source: %s\n' "$source_dir" >&2
    exit 1
fi

mkdir -p "$hermes_home/plugins"
if [[ -e "$plugin_dir" || -L "$plugin_dir" ]]; then
    mkdir -p "$backup_dir"
    backup="$backup_dir/vk.backup.$(date +%Y%m%d%H%M%S)"
    mv "$plugin_dir" "$backup"
    printf 'Backed up existing VK plugin to %s\n' "$backup"
fi

mkdir "$plugin_dir"
cp -R "$source_dir"/. "$plugin_dir"/
find "$plugin_dir" -type d -exec chmod 755 {} +
find "$plugin_dir" -type f -exec chmod 644 {} +
printf 'Installed VKEncrypt Hermes VK plugin at %s\n' "$plugin_dir"
printf 'Next: configure VK_GROUP_TOKEN/VK_GROUP_ID, set the seed, and restart: hermes gateway restart\n'
printf 'Key manager: https://github.com/megamen32/VKCipher/raw/refs/heads/main/scripts/hermes-vk-key.sh\n'
