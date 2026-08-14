#!/usr/bin/env bash

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &> /dev/null && pwd)"

# Official repo packages
pacman -Qqen > "$SCRIPT_DIR/pkglist.txt"

# AUR packages. Prefer prebuilt -bin variants where the AUR provides them so
# restoring the system does not spend time compiling large applications.
pacman -Qqem > "$SCRIPT_DIR/aurlist.txt"
sed -i \
    -e 's/^bambu-studio$/bambu-studio-bin/' \
    -e 's/^codexbar-cli$/codexbar-cli-bin/' \
    -e 's/^yay$/yay-bin/' \
    "$SCRIPT_DIR/aurlist.txt"

# Sync CodexBar's provider selection, but never its API keys or OAuth tokens.
# Credentials remain machine-local and setup-codexbar can provision a key from
# an environment variable on a new machine.
if command -v codexbar &>/dev/null; then
    codexbar config providers |
        awk '$2 == "enabled" { sub(/:$/, "", $1); print $1 }' \
        > "$SCRIPT_DIR/config/.config/codexbar/providers"
fi

# Noctalia v5 stores changes made through its Settings UI as an override file
# under XDG_STATE_HOME, rather than writing ~/.config/noctalia/config.toml.
# Preserve those overrides so GUI changes are included in the dotfiles.
NOCTALIA_STATE_HOME="${XDG_STATE_HOME:-$HOME/.local/state}/noctalia"
NOCTALIA_SETTINGS="$NOCTALIA_STATE_HOME/settings.toml"
TRACKED_NOCTALIA_SETTINGS="$SCRIPT_DIR/config/.local/state/noctalia/settings.toml"
if [[ -f "$NOCTALIA_SETTINGS" && ! "$NOCTALIA_SETTINGS" -ef "$TRACKED_NOCTALIA_SETTINGS" ]]; then
    install -Dm644 "$NOCTALIA_SETTINGS" "$TRACKED_NOCTALIA_SETTINGS"
fi
