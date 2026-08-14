#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &> /dev/null && pwd)"

# Refresh a package list without replacing an existing foo with foo-bin (or
# vice versa). This lets the list record the variant we want on a fresh install,
# regardless of which variant happens to be installed on this machine.
#
# A line containing "# package-name" opts that package out of syncing. The
# exclusion also applies to its -bin/non-bin counterpart and is kept in the file.
sync_package_list() {
    local list_file="$1"
    shift

    local installed_file output_file
    installed_file="$(mktemp)"
    output_file="$(mktemp "${list_file}.XXXXXX")"

    "$@" > "$installed_file"
    awk '
        function package_key(package) {
            sub(/-bin$/, "", package)
            return package
        }

        # First input: packages currently installed.
        FILENAME == ARGV[1] {
            installed[++installed_count] = $0
            next
        }

        # A single commented package name is a persistent opt-out.
        /^[[:space:]]*#[[:space:]]*[^[:space:]#]+[[:space:]]*$/ {
            package = $0
            sub(/^[[:space:]]*#[[:space:]]*/, "", package)
            sub(/[[:space:]]*$/, "", package)
            excluded[package_key(package)] = 1
            comments[++comment_count] = $0
            next
        }

        # Preserve explanatory comments too.
        /^[[:space:]]*#/ {
            comments[++comment_count] = $0
            next
        }

        NF {
            preferred[package_key($1)] = $1
        }

        END {
            for (i = 1; i <= comment_count; i++)
                print comments[i]

            for (i = 1; i <= installed_count; i++) {
                package = installed[i]
                key = package_key(package)
                if (excluded[key] || emitted[key])
                    continue

                if (key in preferred)
                    print preferred[key]
                else
                    print package
                emitted[key] = 1
            }
        }
    ' "$installed_file" "$list_file" > "$output_file"

    chmod --reference="$list_file" "$output_file"
    mv "$output_file" "$list_file"
    rm -f "$installed_file"
}

# Official repo packages
sync_package_list "$SCRIPT_DIR/pkglist.txt" pacman -Qqen

# AUR packages
sync_package_list "$SCRIPT_DIR/aurlist.txt" pacman -Qqem

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
