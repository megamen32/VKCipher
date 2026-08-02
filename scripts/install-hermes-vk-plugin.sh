#!/usr/bin/env bash
set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
source_dir="$repo_root/integrations/hermes-vk-platform"
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
printf 'Next: configure VK_GROUP_TOKEN/VK_GROUP_ID and restart: hermes gateway restart\n'
