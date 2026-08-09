#!/usr/bin/env bash
set -euo pipefail

hermes_home="${HERMES_HOME:-$HOME/.hermes}"
env_file="$hermes_home/.env"
seed_file="$hermes_home/vkencrypt-vk.seed"
key_file="$hermes_home/vkencrypt.key"
restart=false

usage() {
    cat <<'EOF'
VKEncrypt Hermes key manager

Usage:
  hermes-vk-key.sh set-seed [--restart]  Replace the shared seed phrase.
  hermes-vk-key.sh set-key  [--restart]  Replace a direct 64-hex key.
  hermes-vk-key.sh status                 Show active mode and file only.
EOF
}

ensure_files() {
    mkdir -p "$hermes_home"
    touch "$env_file"
    chmod 600 "$env_file"
}

set_env_value() {
    local name="$1" value="$2" tmp
    tmp=$(mktemp "$env_file.tmp.XXXXXX")
    awk -v name="$name" -v value="$value" '
        BEGIN { prefix = name "=" }
        index($0, prefix) == 1 {
            if (!seen) { print prefix value; seen = 1 }
            next
        }
        { print }
        END { if (!seen) print prefix value }
    ' "$env_file" > "$tmp"
    chmod 600 "$tmp"
    mv "$tmp" "$env_file"
}

remove_env_value() {
    local name="$1" tmp
    tmp=$(mktemp "$env_file.tmp.XXXXXX")
    awk -v name="$name" 'index($0, name "=") != 1 { print }' "$env_file" > "$tmp"
    chmod 600 "$tmp"
    mv "$tmp" "$env_file"
}

deactivate_other_mode() {
    local active="$1" name
    for name in VK_ENCRYPT_SEED_FILE VK_ENCRYPT_SEED VK_ENCRYPT_KEY_FILE VK_ENCRYPT_KEY; do
        [[ "$name" == "$active" ]] || remove_env_value "$name"
    done
}

read_secret() {
    local prompt="$1"
    if [[ -t 0 && -r /dev/tty ]]; then
        IFS= read -r -s -p "$prompt" REPLY < /dev/tty
        printf '\n' > /dev/tty
    else
        IFS= read -r -s REPLY
    fi
}

restart_if_requested() {
    if [[ "$restart" == true ]]; then
        command -v hermes >/dev/null 2>&1 || { printf 'hermes is not on PATH\n' >&2; exit 1; }
        hermes gateway restart
    else
        printf 'Key saved. Run: hermes gateway restart\n'
    fi
}

set_seed() {
    read_secret 'VKEncrypt seed: '
    [[ ${#REPLY} -ge 6 ]] || { printf 'Seed must contain at least 6 characters\n' >&2; exit 1; }
    umask 077
    printf '%s\n' "$REPLY" > "$seed_file"
    chmod 600 "$seed_file"
    deactivate_other_mode VK_ENCRYPT_SEED_FILE
    set_env_value VK_ENCRYPT_SEED_FILE '~/.hermes/vkencrypt-vk.seed'
    printf 'Active key mode: seed file (~/.hermes/vkencrypt-vk.seed)\n'
    restart_if_requested
}

set_key() {
    read_secret 'VKEncrypt 64-hex key: '
    [[ "$REPLY" =~ ^[0-9a-fA-F]{64}$ ]] || { printf 'Key must contain exactly 64 hexadecimal characters\n' >&2; exit 1; }
    umask 077
    printf '%s\n' "$REPLY" | tr '[:upper:]' '[:lower:]' > "$key_file"
    chmod 600 "$key_file"
    deactivate_other_mode VK_ENCRYPT_KEY_FILE
    set_env_value VK_ENCRYPT_KEY_FILE '~/.hermes/vkencrypt.key'
    printf 'Active key mode: direct key file (~/.hermes/vkencrypt.key)\n'
    restart_if_requested
}

status() {
    if [[ -f "$env_file" ]] && grep -q '^VK_ENCRYPT_SEED_FILE=' "$env_file"; then
        printf 'Active key mode: seed file\nPath: %s\n' "$(sed -n 's/^VK_ENCRYPT_SEED_FILE=//p' "$env_file" | head -1)"
    elif [[ -f "$env_file" ]] && grep -q '^VK_ENCRYPT_KEY_FILE=' "$env_file"; then
        printf 'Active key mode: direct key file\nPath: %s\n' "$(sed -n 's/^VK_ENCRYPT_KEY_FILE=//p' "$env_file" | head -1)"
    else
        printf 'VKEncrypt key mode: not configured\n'
    fi
}

ensure_files
command_name="${1:-status}"
[[ "${2:-}" == '--restart' ]] && restart=true
case "$command_name" in
    set-seed) set_seed ;;
    set-key) set_key ;;
    status) status ;;
    help|-h|--help) usage ;;
    *) usage >&2; exit 2 ;;
esac
